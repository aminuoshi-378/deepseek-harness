/**
 * The Tavily web-search card's staged form over the `web-search-tavily`
 * settings namespace.
 *
 * The key is the one control that does not live in the section: its literal
 * never rides a response, so the card learns only whether one is configured
 * and writes it through the credentials domain, addressed by the reference the
 * section names. It is still staged with the rest of the form, so one save
 * covers everything the card shows.
 */

import type { IApiClient } from '@deepseek-ai/dsh-client-connection/client'
import type { SettingsScope, SettingsScopeSnapshot, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import {
  CardForm, numberField, textField,
  type CardActions, type CardFieldState, type CardShell,
} from './card-form.ts'

/**
 * Namespace of the Tavily search provider. Spelled here rather than
 * imported: a client package must not depend on a Host package.
 */
export const TAVILY_NS = 'web-search-tavily'

/** Credential reference the provider resolves when the section names none. */
const DEFAULT_API_KEY_REF = 'TAVILY_API_KEY'

/** Form field the credential control stages under. */
const API_KEY_FIELD = 'apiKey'

/** The search-provider fields this card edits. */
export interface TavilySettings {
  /** Credential reference naming the environment key. */
  apiKeyEnv?: string
  /** Provider endpoint; blank inherits the provider default. */
  baseURL?: string
  /** Default result count when a request carries no `maxResults`. */
  maxResults?: number
  /** Extraction depth: `basic` or `advanced`. */
  searchDepth?: 'basic' | 'advanced'
}

/** What the credentials domain last reported, and for which reference. */
interface CredentialState {
  /** Reference this answer describes; a stale response for another one is dropped. */
  ref: string
  /** Whether any layer supplies a value for it. */
  configured: boolean
  /** Whether `credentials.set` can affect it; false disables the control. */
  writable: boolean
}

/** What the Tavily web-search card renders. */
export interface TavilyCardState extends CardShell {
  /** Provider endpoint. */
  baseURL: CardFieldState
  /** Default result count sent to Tavily. */
  maxResults: CardFieldState
  /** Extraction depth string (`basic` or `advanced`). */
  searchDepth: CardFieldState
  /** The staged credential, which starts blank on every load. */
  apiKey: CardFieldState
  /** Whether the Host reports a credential configured for the referenced key. */
  apiKeyConfigured: boolean
  /** Whether the credentials domain accepts a write for it; false disables the control. */
  apiKeyWritable: boolean
}

/** The registration-side face the Tavily card's slot entry injects. */
export interface TavilyCardFace extends CardActions {
  hooks: {
    /** Card snapshot bound by the renderer as useTavilyCard. */
    tavilyCard: SnapshotStore<TavilyCardState>
  }
}

/** Bridges the `web-search-tavily` scope and the credentials domain onto the card. */
export class TavilyCardController {
  private readonly form: CardForm<TavilySettings>
  private readonly store: SnapshotStore<TavilyCardState>
  private credential: CredentialState = { ref: '', configured: false, writable: true }

  /**
   * @param scope - the bound settings scope for the `web-search-tavily` namespace.
   * @param api - wire face used for the credential the section references.
   */
  constructor(
    private readonly scope: SettingsScope<TavilySettings>,
    private readonly api: Pick<IApiClient, 'credentials'>,
  ) {
    this.form = new CardForm(
      scope,
      [textField('baseURL'), numberField('maxResults'), textField('searchDepth')],
      [{ field: API_KEY_FIELD, write: text => this.writeKey(text) }],
    )
    this.store = this.form.bind(() => this.projection())
    scope.subscribe(() => { void this.readCredential() })
    void this.readCredential()
  }

  private projection(): TavilyCardState {
    return {
      ...this.form.shell(),
      // A field the section does not carry renders with the provider default as
      // its visible text (still flagged not-overridden); an empty draft clears
      // the field back to inheriting the composition layer.
      baseURL: this.form.field('baseURL'),
      maxResults: withDefault(this.form.field('maxResults'), '5'),
      searchDepth: withDefault(this.form.field('searchDepth'), DEFAULT_DEPTH),
      apiKey: this.form.field(API_KEY_FIELD),
      apiKeyConfigured: this.credential.configured,
      apiKeyWritable: this.credential.writable,
    }
  }

  /**
   * Ask the credentials domain about the reference the section currently names.
   *
   * The answer is stored with the reference it describes: `apiKeyEnv` can
   * change between the request and its response, and two reads can settle out
   * of order, so a response is published only while it still answers for the
   * reference in force.
   */
  private async readCredential(): Promise<void> {
    const ref = refOf(this.scope.getSnapshot())
    if (ref !== this.credential.ref) {
      this.credential = { ref, configured: false, writable: true }
      this.store.set(this.projection())
    }
    let response: Awaited<ReturnType<IApiClient['credentials']['describe']>>
    try {
      response = await this.api.credentials.describe({ refs: [ref] })
    } catch (_credentialReadFailure) {
      // The card stays usable without this: the key control simply reports the
      // last state it knew, and a write still reaches the Host.
      return
    }
    if (!response.result.ok || ref !== refOf(this.scope.getSnapshot())) return
    const view = response.result.value.credentials[ref]
    const next: CredentialState = {
      ref,
      configured: view?.configured ?? false,
      writable: view?.writable ?? true,
    }
    if (next.configured === this.credential.configured && next.writable === this.credential.writable) return
    this.credential = next
    this.store.set(this.projection())
  }

  /**
   * Re-read after the Host reports a change to the reference this card watches.
   *
   * A key can be written from somewhere else and the settings section does not
   * change when it is, so without this the badge keeps reporting a state the
   * Host already replaced.
   * @param ref - the reference the Host reports as changed.
   */
  refreshCredential(ref: string): void {
    if (ref !== this.credential.ref) return
    void this.readCredential()
  }

  /**
   * Build the face the card's slot registration injects.
   * @returns the card's snapshot and its form actions.
   */
  inject(): TavilyCardFace {
    return { hooks: { tavilyCard: this.store }, ...this.form.actions() }
  }

  /**
   * Write the staged key, then re-read whether the Host now holds one.
   * @param value - the staged credential literal.
   * @returns whether the Host reports a configured credential afterwards.
   */
  private async writeKey(value: string): Promise<boolean> {
    try {
      await this.api.credentials.set({ ref: refOf(this.scope.getSnapshot()), value })
    } catch (_credentialWriteFailure) {
      // Refusals surface through the re-read below: the Host is the only
      // authority on whether the key now exists.
    }
    await this.readCredential()
    return this.credential.configured
  }
}

/**
 * The credential reference the section names, or the provider's default.
 * @param snapshot - the current scope snapshot.
 * @returns the reference to address.
 */
function refOf(snapshot: SettingsScopeSnapshot<TavilySettings>): string {
  const declared = snapshot.value?.apiKeyEnv
  return declared !== undefined && declared.length > 0 ? declared : DEFAULT_API_KEY_REF
}

/** Provider default extraction depth, shown when the section carries none. */
const DEFAULT_DEPTH = 'basic'

/**
 * Surface a provider default as the effective text of a field the section does
 * not carry, while keeping its not-overridden flag intact (the user layer has
 * no entry). A staged edit still answers for itself through {@link CardFieldState}.
 * @param field - the field as the form renders it.
 * @param fallback - the text to show when the section carries no value.
 * @returns the field with a visible default when empty.
 */
function withDefault(field: CardFieldState, fallback: string): CardFieldState {
  if (field.text.length > 0 || field.overridden) return field
  return { ...field, text: fallback }
}

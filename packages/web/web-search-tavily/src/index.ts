/**
 * `@deepseek-ai/dsh-web-search-tavily`: registers a Tavily-backed
 * `WebSearchProvider` with `ctx.web`. A function/namespace plugin (NOT a
 * default-export service): a search provider does not own the `ctx.web` key —
 * it registers INTO the seam's provider registry, exactly as
 * `@deepseek-ai/dsh-web-search-deepseek` does for DeepSeek. The key is owned
 * by `@deepseek-ai/dsh-web`.
 *
 * The configurable section (`web-search-tavily`) is exposed through the shared
 * settings seam so the browser settings page can edit it: the endpoint, the
 * default result count, and the extraction depth are section values written by
 * the user, while the API key travels separately through the credentials
 * domain (named by `apiKeyEnv`) so the literal never rides a section value or
 * a config file.
 *
 * @module @deepseek-ai/dsh-web-search-tavily
 */

import type { Context } from '@deepseek-ai/cordis'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-web'
import {
  TavilySearchProvider,
  TAVILY_DEFAULT_BASE_URL,
  TAVILY_DEFAULT_MAX_RESULTS,
  TAVILY_DEFAULT_SEARCH_DEPTH,
  type TavilySearchProviderOptions,
} from './provider.ts'

export {
  TAVILY_DEFAULT_BASE_URL,
  TAVILY_DEFAULT_MAX_RESULTS,
  TAVILY_DEFAULT_SEARCH_DEPTH,
  TAVILY_PROVIDER_ID,
  TavilySearchProvider,
} from './provider.ts'
export type { TavilySearchProviderOptions } from './provider.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-tavily'

/** The web seam this provider registers into. */
export const inject = ['web']

const DEFAULT_API_KEY_ENV = 'TAVILY_API_KEY'

/** Settings namespace carrying this provider's endpoint, budget, and key reference. */
export const WEB_SEARCH_TAVILY_SETTINGS_NAMESPACE = settingsNamespace('web-search-tavily')

/** Plugin config (all optional — `apply` fills env-var and constant defaults). */
export interface Config {
  /** Literal Tavily API key; prefer {@link apiKeyEnv} so no secret enters configuration files. */
  apiKey?: string
  /** Credential reference resolved for each search; defaults to `TAVILY_API_KEY`. */
  apiKeyEnv?: string
  /** Endpoint base; `/search` is appended. Defaults to the public API. */
  baseURL?: string
  /** Default result count when a request carries no `maxResults`. Defaults to 5. */
  maxResults?: number
  /** Extraction depth: `basic` or `advanced`. Defaults to `basic`. */
  searchDepth?: 'basic' | 'advanced'
}

export const Config: z<Config> = z.object({
  apiKey: z.string().role('secret'),
  apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_API_KEY_ENV),
  baseURL: z.string(),
  maxResults: z.number().step(1).min(1),
  searchDepth: z.union(['basic', 'advanced'] as const),
})

/**
 * Project one resolved section into the options the provider serves its next
 * search with. The section (including the key reference) is authoritative; the
 * environment is a fallback for the key only, never the endpoint's owner.
 */
function resolveOptions(ctx: Context, config: Config): TavilySearchProviderOptions {
  const apiKeyEnv = credentialRef(config.apiKeyEnv ?? DEFAULT_API_KEY_ENV)
  const literalApiKey = config.apiKey !== undefined && config.apiKey.length > 0
    ? config.apiKey
    : undefined
  return {
    ...literalApiKey === undefined ? {} : { apiKey: literalApiKey },
    resolveApiKey: async () => {
      const credentials = ctx.get('credentials')
      if (credentials !== undefined) return (await credentials.resolve(apiKeyEnv))?.value
      const ambient = launchEnvironmentOf(ctx).get(apiKeyEnv)
      return ambient !== undefined && ambient.value.length > 0 ? ambient.value : undefined
    },
    baseURL: config.baseURL ?? TAVILY_DEFAULT_BASE_URL,
    maxResults: config.maxResults ?? TAVILY_DEFAULT_MAX_RESULTS,
    searchDepth: config.searchDepth ?? TAVILY_DEFAULT_SEARCH_DEPTH,
  }
}

/**
 * Register the Tavily search provider with `ctx.web`. The provider's
 * availability is resolved per request: a committed section change (or a
 * credential write on another surface) reaches the very next search without a
 * restart.
 *
 * @param ctx - Cordis context carrying the `web` seam.
 * @param config - plugin configuration; all fields optional.
 */
export function apply(ctx: Context, config: Config): void {
  let current: () => Config = () => config
  installSettingsSection(ctx, WEB_SEARCH_TAVILY_SETTINGS_NAMESPACE, Config, config, {
    setSource: (source) => {
      current = source
    },
    // The registration carries no resolved value: the provider projects the
    // section per search, so a committed change needs no re-registration.
    onChange: () => {},
  })
  ctx.web.registerSearchProvider(new TavilySearchProvider(() => resolveOptions(ctx, current())))
}

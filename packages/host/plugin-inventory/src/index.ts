/** Projection of the current Cordis Loader plugin entries with management operations. */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { Context, FiberState } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
// Typert-generated ./typert and ./remote artifacts import Zod at runtime.
import type {} from 'zod'
import * as yaml from 'js-yaml'
import type {
  PluginEntryId,
  PluginEntrySource,
  PluginEntryType,
  PluginFiberPhase,
  PluginInventoryEntry,
  PluginInventoryInstallResult,
  PluginInventorySnapshot,
  PluginInventoryToggleResult,
  PluginInventoryUninstallResult,
} from './types.ts'

/** Context service key for the writable user patch layer paths. */
const USER_PATCH_LAYER_PATHS = 'userPatchLayerPaths'

/** Absolute paths of the writable user patch layers. */
interface UserPatchLayerPaths {
  profile: string
  home: string
}

export type * from './types.ts'

/** Brand an existing Loader-tree entry id at the owning boundary. */
function pluginEntryId(value: string): PluginEntryId {
  return value as PluginEntryId
}

/** Runtime mirror: FiberState is a cross-package const enum. */
const FIBER_STATE = {
  PENDING: 0 as FiberState.PENDING,
  LOADING: 1 as FiberState.LOADING,
  ACTIVE: 2 as FiberState.ACTIVE,
  FAILED: 3 as FiberState.FAILED,
  DISPOSED: 4 as FiberState.DISPOSED,
  UNLOADING: 5 as FiberState.UNLOADING,
} as const

/** Complete public projection of Cordis Fiber states. */
const FIBER_PHASE = {
  [FIBER_STATE.PENDING]: 'pending',
  [FIBER_STATE.LOADING]: 'loading',
  [FIBER_STATE.ACTIVE]: 'active',
  [FIBER_STATE.FAILED]: 'failed',
  [FIBER_STATE.DISPOSED]: null,
  [FIBER_STATE.UNLOADING]: 'unloading',
} as const satisfies Record<FiberState, PluginFiberPhase>

/** Known internal module name prefixes used to classify plugin source. */
const BUILTIN_PREFIXES = [
  '@deepseek-ai/dsh-',
  '@deepseek-ai/cordis',
  '@deepseek-ai/cordis-',
  'cordis:',
  'cordis-plugin-',
  './',
] as const

/** Mapping from module name keywords to functional plugin types. */
const TYPE_KEYWORDS: Array<{ readonly keywords: readonly string[]; readonly type: PluginEntryType }> = [
  { keywords: ['llm'], type: 'llm' },
  { keywords: ['shell', 'bash', 'pwsh'], type: 'shell' },
  { keywords: ['/fs', '-fs', 'filesystem'], type: 'fs' },
  { keywords: ['lsp', 'language-server'], type: 'lsp' },
  { keywords: ['skill'], type: 'skill' },
  { keywords: ['web', 'web-search'], type: 'web' },
  { keywords: ['terminal'], type: 'terminal' },
  { keywords: ['subagent'], type: 'subagent' },
  { keywords: ['workflow'], type: 'workflow' },
  { keywords: ['session'], type: 'session' },
  { keywords: ['settings'], type: 'settings' },
  { keywords: ['guard', 'loop-hygiene'], type: 'guard' },
  { keywords: ['hooks', 'hook-'], type: 'hooks' },
  { keywords: ['identity'], type: 'identity' },
  { keywords: ['credentials'], type: 'credentials' },
  { keywords: ['compaction'], type: 'compaction' },
  { keywords: ['context'], type: 'context' },
  { keywords: ['preset'], type: 'preset' },
  { keywords: ['bundle'], type: 'bundle' },
  { keywords: ['self-modification'], type: 'self-modification' },
  { keywords: ['subprocess'], type: 'subprocess' },
  { keywords: ['e2b'], type: 'e2b' },
  { keywords: ['apiproxy', 'api-remote'], type: 'api' },
  { keywords: ['typert'], type: 'typert' },
  { keywords: ['sdk'], type: 'sdk' },
  { keywords: ['boot'], type: 'boot' },
  { keywords: ['support'], type: 'support' },
  { keywords: ['/util', '-util'], type: 'util' },
  { keywords: ['client'], type: 'client' },
  { keywords: ['extensions'], type: 'extensions' },
  { keywords: ['core', 'agent', 'agent-loop', 'tools', 'system-prompt'], type: 'core' },
]

/** Infer whether a module is built-in or third-party from its module name. */
function inferSource(moduleName: string): PluginEntrySource {
  return BUILTIN_PREFIXES.some(prefix => moduleName.startsWith(prefix))
    ? 'builtin'
    : 'third-party'
}

/** Infer a functional plugin type from its module name. */
function inferType(moduleName: string): PluginEntryType {
  const lower = moduleName.toLowerCase()
  for (const { keywords, type } of TYPE_KEYWORDS) {
    if (keywords.some(kw => lower.includes(kw))) return type
  }
  return 'other'
}

/** Build a short human-readable description from the module name. */
function inferDescription(moduleName: string, type: PluginEntryType): string {
  const short = moduleName
    .replace(/^@deepseek-ai\/dsh-(?:host-|client-)?/, '')
    .replace(/^@deepseek-ai\//, '')
    .replace(/^cordis:/, '')
    .replace(/^cordis-plugin-/, '')
    .replace(/^dsh-(?:host-|client-)?/, '')
  if (type === 'other') return short
  return `${short} (${type})`
}

/** Remote-only service exposing the Loader's current non-group entry state with management. */
export class PluginInventoryGateway extends TypertRemoteService {
  static inject = ['loader']

  constructor(ctx: Context) {
    super(ctx, 'pluginInventory')
  }

  /**
   * Read the Loader directly on every call. Cordis's internal plugin/status
   * events already maintain Entry.fiber and Fiber.state, so a second cache
   * would only add another lifecycle truth to keep synchronized.
   * @returns Current non-group Loader entries in Loader order.
   */
  @Remote('list')
  list(): PluginInventorySnapshot {
    const entries: PluginInventoryEntry[] = []
    for (const entry of this.ctx.loader.entries()) {
      if (entry.options.group) continue
      const moduleName = entry.options.name
      const source = inferSource(moduleName)
      const type = inferType(moduleName)
      entries.push({
        entryId: pluginEntryId(entry.id),
        moduleName,
        enabled: !entry.disabled,
        fiberPhase: entry.fiber === undefined ? null : FIBER_PHASE[entry.fiber.state],
        source,
        type,
        description: inferDescription(moduleName, type),
      })
    }
    return { entries }
  }

  /**
   * Persist an enable/disable toggle to the profile's user patch layer using the
   * *config-level* `id` (e.g. "tool-bash") so it survives restarts. The internal
   * Loader `entry.id` is a UUID and changes on every boot, so it must not be used
   * in patch files.
   */
  private writeUserPatchDisabled(configId: string, enabled: boolean): void {
    const paths = this.ctx.get(USER_PATCH_LAYER_PATHS) as UserPatchLayerPaths | undefined
    if (paths === undefined) return
    const patchPath = paths.profile
    let loaded: unknown[] = []
    if (existsSync(patchPath)) {
      const raw = readFileSync(patchPath, 'utf8')
      const parsed = yaml.load(raw)
      if (Array.isArray(parsed)) loaded = parsed as unknown[]
    }
    const patches: Array<Record<string, unknown>> = []
    for (const item of loaded) {
      if (item !== null && typeof item === 'object') patches.push(item as Record<string, unknown>)
    }
    const existing = patches.find(patch => typeof patch.id === 'string' && patch.id === configId)
    if (existing) {
      const existingIndex = patches.indexOf(existing)
      if (enabled) {
        const merged: Record<string, unknown> = { id: configId }
        for (const key of Object.keys(existing)) {
          if (key === 'id' || key === 'disabled') continue
          merged[key] = existing[key]
        }
        // If the id-targeted patch no longer carries any overrides after
        // removing the disable flag, drop the whole row rather than leaving
        // a structurally empty `{ id: x }` placeholder that would shadow a
        // bundle's later config changes for the same row.
        const remaining = Object.keys(merged).filter(key => key !== 'id')
        if (remaining.length === 0) {
          patches.splice(existingIndex, 1)
        } else {
          patches[existingIndex] = merged
        }
      } else {
        const merged: Record<string, unknown> = { id: configId, disabled: true }
        for (const key of Object.keys(existing)) {
          if (key === 'id' || key === 'disabled') continue
          merged[key] = existing[key]
        }
        patches[existingIndex] = merged
      }
    } else if (!enabled) {
      patches.push({ id: configId, disabled: true })
    }
    writeFileSync(patchPath, yaml.dump(patches))
  }

  /**
   * Toggle a plugin entry's enabled state by updating its Loader options.
   * When the host provides writable user patch layer paths (profile launcher
   * surface), the change is additionally persisted into the profile's own
   * `cordis.patch.yml` using the *config-level* `id` (e.g. "tool-bash") so it
   * survives a process restart.
   * @param entryId - Internal Loader entry id (UUID) to toggle.
   * @param enabled - Target enabled state.
   * @returns Success with the new state, or a typed failure.
   */
  @Remote('setEnabled')
  async setEnabled(entryId: string, enabled: boolean): Promise<PluginInventoryToggleResult> {
    try {
      const entry = this.ctx.loader.resolve(entryId)
      await this.ctx.loader.update(entryId, { disabled: enabled ? null : true })
      // Use the stable config id (e.g. "tool-bash") for the patch file, not the ephemeral UUID.
      const configId = entry.options.id
      if (typeof configId === 'string') {
        this.writeUserPatchDisabled(configId, enabled)
      }
      return { ok: true, entryId: pluginEntryId(entryId), enabled }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('cannot resolve')) {
        return { ok: false, reason: 'entry-missing', message }
      }
      return { ok: false, reason: 'toggle-failed', message }
    }
  }

  /**
   * Install a new plugin entry into the Loader's root group.
   * @param moduleName - Module specifier to import.
   * @returns Success with the new entry id, or a typed failure.
   */
  @Remote('addPlugin')
  async install(moduleName: string): Promise<PluginInventoryInstallResult> {
    if (!moduleName || typeof moduleName !== 'string') {
      return { ok: false, reason: 'invalid-name', message: 'module name must be a non-empty string' }
    }
    try {
      const id = await this.ctx.loader.create({ name: moduleName, config: {} })
      return { ok: true, entryId: pluginEntryId(id) }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, reason: 'install-failed', message }
    }
  }

  /**
   * Uninstall a plugin entry from the Loader.
   * Built-in plugins (dsh-* / cordis-*) are protected from removal.
   * @param entryId - Stable entry identity to remove.
   * @returns Success or a typed failure.
   */
  @Remote('uninstall')
  async uninstall(entryId: string): Promise<PluginInventoryUninstallResult> {
    try {
      const entry = this.ctx.loader.resolve(entryId)
      if (inferSource(entry.options.name) === 'builtin') {
        return {
          ok: false,
          reason: 'builtin-protected',
          message: `cannot uninstall built-in plugin "${entry.options.name}"`,
        }
      }
      await this.ctx.loader.remove(entryId)
      return { ok: true, entryId: pluginEntryId(entryId) }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, reason: 'uninstall-failed', message }
    }
  }
}

export default PluginInventoryGateway

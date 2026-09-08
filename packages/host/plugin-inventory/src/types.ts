import type { Branded } from '@deepseek-ai/dsh-brand'

/** Stable Loader-tree identity of one configured plugin entry. */
export type PluginEntryId = Branded<'PluginEntryId'>

/** Lifecycle state of an entry's root Fiber, or null when it has no live root Fiber. */
export type PluginFiberPhase =
  | 'pending'
  | 'loading'
  | 'active'
  | 'failed'
  | 'unloading'
  | null

/** Where a plugin entry originates from. */
export type PluginEntrySource = 'builtin' | 'third-party'

/** Functional category of a plugin entry, derived from its module name. */
export type PluginEntryType =
  | 'core'
  | 'llm'
  | 'shell'
  | 'fs'
  | 'lsp'
  | 'skill'
  | 'web'
  | 'terminal'
  | 'subagent'
  | 'workflow'
  | 'session'
  | 'settings'
  | 'guard'
  | 'hooks'
  | 'identity'
  | 'credentials'
  | 'compaction'
  | 'context'
  | 'preset'
  | 'bundle'
  | 'self-modification'
  | 'subprocess'
  | 'e2b'
  | 'api'
  | 'typert'
  | 'sdk'
  | 'boot'
  | 'support'
  | 'util'
  | 'client'
  | 'extensions'
  | 'other'

/** One non-group Loader entry exposed to trusted clients. */
export interface PluginInventoryEntry {
  readonly entryId: PluginEntryId
  /** Exact module specifier imported by the Loader entry. */
  readonly moduleName: string
  /** Effective Loader enablement, including disabled ancestor groups. */
  readonly enabled: boolean
  readonly fiberPhase: PluginFiberPhase
  /** Whether the plugin is built-in or installed from a third-party source. */
  readonly source: PluginEntrySource
  /** Functional category derived from the module name. */
  readonly type: PluginEntryType
  /** Human-readable description or short label for the plugin's purpose. */
  readonly description: string
}

/** Effective enablement of one preset composition row. */
export type PresetPluginEnablement = boolean | 'conditional'

/** One plugin row an agent preset's composition names. */
export interface AgentPresetPluginRow {
  /** Composition row id, or null when the row declares none. */
  readonly entryId: string | null
  /** Module specifier the row names. */
  readonly moduleName: string
  /**
   * Effective enablement, including disabled ancestor groups. `'conditional'`
   * marks a `!!js` disabled expression on a composition no session has
   * mounted, which only a Loader context can decide.
   */
  readonly enabled: PresetPluginEnablement
  /** The row's own `!!js` disabled expression, when it carries one. */
  readonly condition?: string
  /** Root-fiber phase when the composition is live; null otherwise. */
  readonly fiberPhase: PluginFiberPhase
}

/** One agent preset's identity and flattened composition in the inventory. */
export interface AgentPresetPluginGroup {
  /** Stable preset id. */
  readonly id: string
  /** Whether the deployment ships the preset or the user owns it. */
  readonly trust: 'system' | 'user'
  /** Display name the preset published; a reader falls back to the id. */
  readonly name?: string
  /** Whether a session naming no preset composes this one. */
  readonly isDefault: boolean
  /** Why this preset's composition cannot be read; absent when rows answer. */
  readonly broken?: string
  /** Plugin rows in composition order; empty when the preset is broken. */
  readonly rows: readonly AgentPresetPluginRow[]
}

/** Point-in-time inventory returned by the plugin inventory Remote. */
export interface PluginInventorySnapshot {
  readonly entries: readonly PluginInventoryEntry[]
  /**
   * Per-preset compositions, present only when an agent-preset roster is
   * composed in this deployment.
   */
  readonly agentPresets?: readonly AgentPresetPluginGroup[]
}

/** Result of toggling a plugin entry's enabled state. */
export type PluginInventoryToggleResult =
  | { ok: true; entryId: PluginEntryId; enabled: boolean }
  | { ok: false; reason: 'entry-missing' | 'not-writable' | 'toggle-failed'; message: string }

/** Result of uninstalling a plugin entry. */
export type PluginInventoryUninstallResult =
  | { ok: true; entryId: PluginEntryId }
  | { ok: false; reason: 'entry-missing' | 'builtin-protected' | 'uninstall-failed'; message: string }

/** Result of installing a new plugin entry. */
export type PluginInventoryInstallResult =
  | { ok: true; entryId: PluginEntryId }
  | { ok: false; reason: 'invalid-name' | 'install-failed'; message: string }

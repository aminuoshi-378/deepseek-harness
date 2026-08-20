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

/** Point-in-time inventory returned by the plugin inventory Remote. */
export interface PluginInventorySnapshot {
  readonly entries: readonly PluginInventoryEntry[]
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

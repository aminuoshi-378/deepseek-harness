import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import type {
  PluginInventoryInstallResult,
  PluginInventorySnapshot,
  PluginInventoryToggleResult,
  PluginInventoryUninstallResult,
} from '@deepseek-ai/dsh-api-remotes/client'
import {
  IconChevronDownOutline14,
  IconSearchOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { PluginInventoryLocaleKey } from './locales.ts'
import css from './PluginInventorySettingsTab.module.css'

/** Registration-side Remote face used by the section. */
export interface PluginInventorySettingsTabInjected {
  /** Read a current Host inventory snapshot. */
  list: () => Promise<PluginInventorySnapshot>
  /** Toggle a plugin entry's enabled state. */
  setEnabled: (entryId: string, enabled: boolean) => Promise<PluginInventoryToggleResult>
  /** Uninstall a plugin entry. */
  uninstall: (entryId: string) => Promise<PluginInventoryUninstallResult>
  /** Install a new plugin entry by module name. */
  install: (moduleName: string) => Promise<PluginInventoryInstallResult>
}

type PluginInventoryEntry = PluginInventorySnapshot['entries'][number]
type PluginFiberPhase = PluginInventoryEntry['fiberPhase']
type PluginEntrySource = PluginInventoryEntry['source']
type PluginEntryType = PluginInventoryEntry['type']

/** Full component props assembled by the Settings slot renderer. */
export type PluginInventorySettingsTabProps =
  PropsRuntime<'settings.plugins.tab'>
  & PropsLocale<'settings.pluginInventory'>
  & InjectFace<PluginInventorySettingsTabInjected>

type ViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly snapshot: PluginInventorySnapshot }

const PHASE_KEYS = {
  pending: 'pending',
  loading: 'loadingPhase',
  active: 'active',
  failed: 'failed',
  unloading: 'unloading',
} satisfies Record<Exclude<PluginFiberPhase, null>, PluginInventoryLocaleKey>

/** Localized accessible label for one root Fiber phase. */
function phaseLabel(
  phase: PluginFiberPhase,
  t: PluginInventorySettingsTabProps['t'],
): string {
  return phase === null ? t('unobserved') : t(PHASE_KEYS[phase])
}

/** Compact a module specifier without guessing whether its Loader id was generated. */
function moduleShortName(moduleName: string): string {
  const unscoped = moduleName.startsWith('@') ? moduleName.slice(moduleName.indexOf('/') + 1) : moduleName
  return unscoped
    .replace(/^cordis:/, '')
    .replace(/^cordis-plugin-/, '')
    .replace(/^dsh-(?:host-|client-)?/, '')
}

/** Whether an inventory row matches the local catalog query and filters. */
function matches(
  entry: PluginInventoryEntry,
  normalizedQuery: string,
  sourceFilter: PluginEntrySource | 'all',
  typeFilter: PluginEntryType | 'all',
): boolean {
  if (sourceFilter !== 'all' && entry.source !== sourceFilter) return false
  if (typeFilter !== 'all' && entry.type !== typeFilter) return false
  if (normalizedQuery.length === 0) return true
  return [entry.moduleName, entry.entryId, entry.description, entry.type, entry.source]
    .some(value => value.toLocaleLowerCase().includes(normalizedQuery))
}

/** Render the plugin inventory with filtering, source/type facets, and management actions. */
export function PluginInventorySettingsTab({ list, setEnabled, uninstall, install, t }: PluginInventorySettingsTabProps): ReactNode {
  const catalogId = useId()
  const [request, setRequest] = useState(0)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<PluginInventoryEntry['entryId'] | null>(null)
  const [sourceFilter, setSourceFilter] = useState<PluginEntrySource | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<PluginEntryType | 'all'>('all')
  const [state, setState] = useState<ViewState>({ status: 'loading' })
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [showInstall, setShowInstall] = useState(false)
  const [installName, setInstallName] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [batchInProgress, setBatchInProgress] = useState(false)

  const refresh = useCallback(() => {
    setRequest(value => value + 1)
  }, [])

  useEffect(() => {
    let current = true
    void Promise.resolve().then(() => list()).then(
      (snapshot) => { if (current) setState({ status: 'ready', snapshot }) },
      () => { if (current) setState({ status: 'error' }) },
    )
    return () => { current = false }
  }, [list, request])

  const normalizedQuery = query.trim().toLocaleLowerCase()

  // Collect available types from the snapshot for the type filter dropdown.
  const availableTypes = useMemo(() => {
    if (state.status !== 'ready') return [] as PluginEntryType[]
    const types = new Set<PluginEntryType>()
    for (const entry of state.snapshot.entries) {
      if (sourceFilter !== 'all' && entry.source !== sourceFilter) continue
      types.add(entry.type)
    }
    return [...types].sort()
  }, [state, sourceFilter])

  const filteredEntries = useMemo(
    () => state.status === 'ready'
      ? state.snapshot.entries.filter(entry => matches(entry, normalizedQuery, sourceFilter, typeFilter))
      : [],
    [normalizedQuery, state, sourceFilter, typeFilter],
  )

  useEffect(() => {
    if (expanded !== null && !filteredEntries.some(entry => entry.entryId === expanded)) {
      setExpanded(null)
    }
  }, [expanded, filteredEntries])

  const retry = (): void => {
    setState({ status: 'loading' })
    refresh()
  }

  const handleToggle = useCallback(async (entry: PluginInventoryEntry) => {
    setActionInProgress(entry.entryId)
    setActionError(null)
    try {
      const result = await setEnabled(entry.entryId, !entry.enabled)
      if (!result.ok) {
        setActionError(result.message)
      } else {
        refresh()
      }
    } catch {
      setActionError(t('toggleFailed'))
    } finally {
      setActionInProgress(null)
    }
  }, [setEnabled, refresh, t])

  const handleUninstall = useCallback(async (entry: PluginInventoryEntry) => {
    if (!globalThis.confirm(t('uninstallConfirm'))) return
    setActionInProgress(entry.entryId)
    setActionError(null)
    try {
      const result = await uninstall(entry.entryId)
      if (!result.ok) {
        setActionError(result.reason === 'builtin-protected' ? t('builtinProtected') : result.message)
      } else {
        refresh()
      }
    } catch {
      setActionError(t('uninstallFailed'))
    } finally {
      setActionInProgress(null)
    }
  }, [uninstall, refresh, t])

  const handleInstall = useCallback(async () => {
    const name = installName.trim()
    if (!name) return
    setActionInProgress('__install__')
    setActionError(null)
    try {
      const result = await install(name)
      if (!result.ok) {
        setActionError(result.message)
      } else {
        setInstallName('')
        setShowInstall(false)
        refresh()
      }
    } catch {
      setActionError(t('installFailed'))
    } finally {
      setActionInProgress(null)
    }
  }, [install, installName, refresh, t])

  const toggleSelect = useCallback((entryId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(entryId)) next.delete(entryId)
      else next.add(entryId)
      return next
    })
  }, [])

  const selectAllFiltered = useCallback(() => {
    setSelected(new Set(filteredEntries.map(e => e.entryId)))
  }, [filteredEntries])

  const clearSelection = useCallback(() => {
    setSelected(new Set())
  }, [])

  const handleBatch = useCallback(async (action: 'enable' | 'disable' | 'uninstall') => {
    const targets = filteredEntries.filter(e => selected.has(e.entryId))
    if (targets.length === 0) return
    const confirmMsg = action === 'enable'
      ? t('batchEnableConfirm').replace('{count}', String(targets.length))
      : action === 'disable'
        ? t('batchDisableConfirm').replace('{count}', String(targets.length))
        : t('batchUninstallConfirm').replace('{count}', String(targets.length))
    if (!globalThis.confirm(confirmMsg)) return
    setBatchInProgress(true)
    setActionError(null)
    let failed = 0
    for (const entry of targets) {
      try {
        if (action === 'enable' || action === 'disable') {
          const result = await setEnabled(entry.entryId, action === 'enable')
          if (!result.ok) failed++
        } else {
          const result = await uninstall(entry.entryId)
          if (!result.ok) failed++
        }
      } catch {
        failed++
      }
    }
    setSelected(new Set())
    refresh()
    setBatchInProgress(false)
    if (failed > 0) {
      setActionError(t('batchPartialFailed').replace('{failed}', String(failed)))
    }
  }, [filteredEntries, selected, setEnabled, uninstall, refresh, t])

  return (
    <div className={css.section} aria-busy={state.status === 'loading'}>
      {state.status === 'loading' ? <p className={css.status}>{t('loading')}</p> : null}
      {state.status === 'error' ? (
        <div className={css.failure}>
          <p role="alert">{t('error')}</p>
          <button type="button" onClick={retry}>{t('retry')}</button>
        </div>
      ) : null}
      {state.status === 'ready' ? (
        <div className={css.catalog}>
          {/* Search bar */}
          <label className={css.search}>
            <IconSearchOutline16 aria-hidden="true" />
            <span className={css.visuallyHidden}>{t('search')}</span>
            <input
              type="search"
              value={query}
              placeholder={t('search')}
              aria-label={t('search')}
              onChange={(event) => { setQuery(event.currentTarget.value) }}
            />
          </label>

          {/* Filters */}
          <div className={css.filters}>
            <label className={css.filter}>
              <span>{t('source')}</span>
              <select
                value={sourceFilter}
                onChange={(e) => { setSourceFilter(e.target.value as PluginEntrySource | 'all'); setTypeFilter('all') }}
                aria-label={t('source')}
              >
                <option value="all">{t('sourceAll')}</option>
                <option value="builtin">{t('sourceBuiltin')}</option>
                <option value="third-party">{t('sourceThirdParty')}</option>
              </select>
            </label>
            <label className={css.filter}>
              <span>{t('type')}</span>
              <select
                value={typeFilter}
                onChange={(e) => { setTypeFilter(e.target.value as PluginEntryType | 'all') }}
                aria-label={t('type')}
              >
                <option value="all">{t('typeAll')}</option>
                {availableTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={css.installButton}
              onClick={() => { setShowInstall(s => !s) }}
            >
              {t('install')}
            </button>
          </div>

          {/* Install panel */}
          {showInstall ? (
            <div className={css.installPanel}>
              <label className={css.installField}>
                <span>{t('installModuleName')}</span>
                <input
                  type="text"
                  value={installName}
                  placeholder={t('installModuleNamePlaceholder')}
                  onChange={(e) => { setInstallName(e.target.value) }}
                />
              </label>
              <div className={css.installActions}>
                <button
                  type="button"
                  className={css.installConfirm}
                  disabled={!installName.trim() || actionInProgress === '__install__'}
                  onClick={() => { void handleInstall() }}
                >
                  {actionInProgress === '__install__' ? t('installing') : t('installConfirm')}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowInstall(false); setInstallName('') }}
                >
                  {t('installCancel')}
                </button>
              </div>
            </div>
          ) : null}

          {/* Error banner */}
          {actionError ? (
            <p className={css.actionError} role="alert">{actionError}</p>
          ) : null}

          {/* Batch toolbar */}
          {filteredEntries.length > 0 ? (
            <div className={css.batchToolbar}>
              <button
                type="button"
                className={css.batchSelectBtn}
                disabled={batchInProgress}
                onClick={selected.size === filteredEntries.length ? clearSelection : selectAllFiltered}
              >
                {selected.size === filteredEntries.length ? t('batchSelectNone') : t('batchSelectAll')}
              </button>
              {selected.size > 0 ? (
                <>
                  <span className={css.batchCount}>
                    {t('batchSelected').replace('{count}', String(selected.size))}
                  </span>
                  <button
                    type="button"
                    className={css.batchEnableBtn}
                    disabled={batchInProgress}
                    onClick={() => { void handleBatch('enable') }}
                  >
                    {t('batchEnable')}
                  </button>
                  <button
                    type="button"
                    className={css.batchDisableBtn}
                    disabled={batchInProgress}
                    onClick={() => { void handleBatch('disable') }}
                  >
                    {t('batchDisable')}
                  </button>
                  <button
                    type="button"
                    className={css.batchUninstallBtn}
                    disabled={batchInProgress}
                    onClick={() => { void handleBatch('uninstall') }}
                  >
                    {batchInProgress ? t('batchInProgress') : t('batchUninstall')}
                  </button>
                </>
              ) : null}
            </div>
          ) : null}

          {/* Plugin count */}
          <div className={css.catalogHeading}>
            <h3>{t('catalog')}</h3>
            <span data-plugin-count={filteredEntries.length}>{filteredEntries.length}</span>
          </div>

          {state.snapshot.entries.length === 0 ? <p className={css.status}>{t('empty')}</p> : null}
          {state.snapshot.entries.length > 0 && filteredEntries.length === 0
            ? <p className={css.status}>{t('emptySearch')}</p>
            : null}
          {filteredEntries.length > 0 ? (
            <ul className={css.cards}>
              {filteredEntries.map((entry) => {
                const status = phaseLabel(entry.fiberPhase, t)
                const title = moduleShortName(entry.moduleName)
                const configuration = t(entry.enabled ? 'enabledTag' : 'disabledTag')
                const sourceLabel = t(entry.source === 'builtin' ? 'builtinTag' : 'thirdPartyTag')
                const open = expanded === entry.entryId
                const detailId = `${catalogId}-details-${encodeURIComponent(entry.entryId)}`
                const busy = actionInProgress === entry.entryId
                return (
                  <li
                    className={css.card}
                    key={entry.entryId}
                    data-plugin-entry={entry.entryId}
                    data-open={open ? 'true' : undefined}
                    data-source={entry.source}
                  >
                    <input
                      type="checkbox"
                      className={css.cardCheckbox}
                      checked={selected.has(entry.entryId)}
                      disabled={batchInProgress}
                      aria-label={`${title} ${t('source')}: ${sourceLabel}`}
                      onChange={() => { toggleSelect(entry.entryId) }}
                    />
                    <button
                      className={css.cardContent}
                      type="button"
                      aria-expanded={open}
                      aria-controls={detailId}
                      aria-label={entry.enabled ? `${title}, ${status}, ${configuration}` : `${title}, ${configuration}`}
                      onClick={() => {
                        setExpanded(current => current === entry.entryId ? null : entry.entryId)
                      }}
                    >
                      <strong className={css.cardTitle} title={entry.moduleName}>{title}</strong>
                      <span className={css.cardTrailing}>
                        <span className={css.sourceTag} data-source={entry.source}>{sourceLabel}</span>
                        {entry.enabled ? (
                          <span
                            className={css.statusDot}
                            data-phase={entry.fiberPhase ?? 'unobserved'}
                            role="img"
                            aria-label={status}
                            title={status}
                          />
                        ) : null}
                        <span className={css.configTag} data-enabled={entry.enabled ? 'true' : 'false'}>
                          {configuration}
                        </span>
                        <IconChevronDownOutline14 className={css.chevron} size={12} aria-hidden="true" />
                      </span>
                    </button>
                    {open ? (
                      <div className={css.cardDetails} id={detailId}>
                        <code className={css.entryValue} data-loader-entry>{entry.entryId}</code>
                        <dl className={css.details}>
                          <div>
                            <dt>{t('module')}</dt>
                            <dd>{entry.moduleName}</dd>
                          </div>
                          <div>
                            <dt>{t('description')}</dt>
                            <dd>{entry.description}</dd>
                          </div>
                          <div>
                            <dt>{t('source')}</dt>
                            <dd>{sourceLabel}</dd>
                          </div>
                          <div>
                            <dt>{t('type')}</dt>
                            <dd>{entry.type}</dd>
                          </div>
                          <div>
                            <dt>{t('configuration')}</dt>
                            <dd>{configuration}</dd>
                          </div>
                          {entry.enabled ? (
                            <div>
                              <dt>{t('cordis')}</dt>
                              <dd>{status}</dd>
                            </div>
                          ) : null}
                        </dl>
                        <div className={css.cardActions}>
                          <button
                            type="button"
                            className={css.toggleBtn}
                            disabled={busy}
                            onClick={() => { void handleToggle(entry) }}
                          >
                            {busy ? t('toggling') : entry.enabled ? t('disable') : t('enable')}
                          </button>
                          <button
                            type="button"
                            className={css.uninstallBtn}
                            disabled={busy || entry.source === 'builtin'}
                            title={entry.source === 'builtin' ? t('builtinProtected') : undefined}
                            onClick={() => { void handleUninstall(entry) }}
                          >
                            {busy ? t('uninstalling') : t('uninstall')}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

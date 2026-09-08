/**
 * Plugin management tab: shows third-party plugins only, with batch
 * enable/disable/uninstall operations. Registered alongside the read-only
 * inventory tab in the Plugins settings section.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { PluginInventorySnapshot } from '@deepseek-ai/dsh-api-remotes/client'
import type { PluginInventoryToggleResult, PluginInventoryUninstallResult, PluginInventoryInstallResult } from '@deepseek-ai/dsh-host-plugin-inventory/types'
import {
  Button,
  IconSearchOutline16,
  Modal,
  StateDot,
  Tag,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { StateDotState, TagTone } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { PluginInventoryLocaleKey } from './locales.ts'
import css from './PluginInventorySettingsTab.module.css'

type PluginInventoryEntry = PluginInventorySnapshot['entries'][number]
type PluginFiberPhase = PluginInventoryEntry['fiberPhase']

/** Registration-side Remote face used by the management tab. */
export interface PluginManagementTabInjected {
  /** Read a current Host inventory snapshot. */
  list: () => Promise<PluginInventorySnapshot>
  /** Toggle a plugin entry's enabled state. */
  setEnabled: (entryId: string, enabled: boolean) => Promise<PluginInventoryToggleResult>
  /** Uninstall a plugin entry. */
  uninstall: (entryId: string) => Promise<PluginInventoryUninstallResult>
  /** Install a new plugin by module name. */
  install: (moduleName: string) => Promise<PluginInventoryInstallResult>
}

/** Full component props assembled by the Settings slot renderer. */
export type PluginManagementTabProps =
  PropsRuntime<'settings.plugins.tab'>
  & PropsLocale<'settings.pluginInventory'>
  & InjectFace<PluginManagementTabInjected>

type Translate = PluginManagementTabProps['t']

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

function phaseLabel(phase: PluginFiberPhase, t: Translate): string {
  return phase === null ? t('unobserved') : t(PHASE_KEYS[phase])
}

function moduleShortName(moduleName: string): string {
  const unscoped = moduleName.startsWith('@') ? moduleName.slice(moduleName.indexOf('/') + 1) : moduleName
  return unscoped
    .replace(/^cordis:/, '')
    .replace(/^cordis-plugin-/, '')
    .replace(/^dsh-(?:host-|client-)?/, '')
}

function matches(moduleName: string, entryId: string | null, normalizedQuery: string): boolean {
  if (normalizedQuery.length === 0) return true
  return [moduleName, ...entryId === null ? [] : [entryId]]
    .some(value => value.toLocaleLowerCase().includes(normalizedQuery))
}

const PHASE_DOT_STATES = {
  pending: 'idle',
  loading: 'ongoing',
  active: 'done',
  failed: 'error',
  unloading: 'ongoing',
} as const satisfies Record<NonNullable<PluginFiberPhase>, StateDotState>

function PhaseDot({ phase, t }: { readonly phase: NonNullable<PluginFiberPhase>; readonly t: Translate }): ReactNode {
  const status = phaseLabel(phase, t)
  return (
    <span className={css.phaseDot} role="img" aria-label={status} title={status}>
      <StateDot state={PHASE_DOT_STATES[phase]} />
    </span>
  )
}

type EnablementKind = 'enabled' | 'disabled' | 'failed'

const TAG_TONES = {
  enabled: 'success',
  disabled: 'neutral',
  failed: 'danger',
} as const satisfies Record<EnablementKind, TagTone>

function StateTag({ kind, label }: { readonly kind: EnablementKind; readonly label: string }): ReactNode {
  return <Tag tone={TAG_TONES[kind]}>{label}</Tag>
}

export function PluginManagementTab({ list, setEnabled, uninstall, install, t }: PluginManagementTabProps): ReactNode {
  const [request, setRequest] = useState(0)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [state, setState] = useState<ViewState>({ status: 'loading' })
  const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set())
  const [batchInProgress, setBatchInProgress] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [showInstall, setShowInstall] = useState(false)
  const [installName, setInstallName] = useState('')
  const [installInProgress, setInstallInProgress] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'enable' | 'disable' | 'uninstall' | null>(null)

  useEffect(() => {
    let current = true
    void Promise.resolve().then(() => list()).then(
      (snapshot) => { if (current) setState({ status: 'ready', snapshot }) },
      () => { if (current) setState({ status: 'error' }) },
    )
    return () => { current = false }
  }, [list, request])

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const snapshot = state.status === 'ready' ? state.snapshot : undefined
  const allEntries = snapshot?.entries ?? []

  // Only third-party plugins
  const thirdPartyEntries = allEntries.filter(e => e.source === 'third-party')
  const filteredEntries = thirdPartyEntries.filter(e => matches(e.moduleName, e.entryId, normalizedQuery))

  const retry = (): void => {
    setState({ status: 'loading' })
    setRequest(value => value + 1)
  }

  const toggleRow = (key: string): void => {
    setExpanded(current => current === key ? null : key)
  }

  // ── Batch operations ──
  const toggleSelect = useCallback((entryId: string) => {
    setBatchSelected(prev => {
      const next = new Set(prev)
      if (next.has(entryId)) next.delete(entryId)
      else next.add(entryId)
      return next
    })
  }, [])
  const selectAllFiltered = useCallback(() => {
    setBatchSelected(new Set(filteredEntries.map(e => e.entryId)))
  }, [filteredEntries])
  const clearSelection = useCallback(() => { setBatchSelected(new Set()) }, [])
  const handleBatch = useCallback((action: 'enable' | 'disable' | 'uninstall') => {
    if (batchSelected.size === 0) return
    setConfirmAction(action)
  }, [batchSelected.size])

  const executeBatch = useCallback(async () => {
    const action = confirmAction
    if (action === null) return
    const targets = filteredEntries.filter(e => batchSelected.has(e.entryId))
    setConfirmAction(null)
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
      } catch { failed++ }
    }
    setBatchSelected(new Set())
    setRequest(value => value + 1)
    setBatchInProgress(false)
    if (failed > 0) {
      setActionError(t('batchPartialFailed').replace('{failed}', String(failed)))
    }
  }, [confirmAction, filteredEntries, batchSelected, setEnabled, uninstall, t])

  const handleInstall = useCallback(async () => {
    const name = installName.trim()
    if (!name) return
    setInstallInProgress(true)
    setActionError(null)
    try {
      const result = await install(name)
      if (!result.ok) {
        setActionError(result.message)
      } else {
        setInstallName('')
        setShowInstall(false)
        setRequest(value => value + 1)
      }
    } catch {
      setActionError(t('installFailed'))
    } finally {
      setInstallInProgress(false)
    }
  }, [install, installName, t])

  const rowCard = (entry: PluginInventoryEntry): ReactNode => {
    const key = `mgmt:${entry.entryId}`
    const title = moduleShortName(entry.moduleName)
    const failed = entry.fiberPhase === 'failed'
    const stateText = failed ? t('failedTag') : t(entry.enabled ? 'enabledTag' : 'disabledTag')
    const kind: EnablementKind = failed ? 'failed' : entry.enabled ? 'enabled' : 'disabled'
    return (
      <li className={css.card} key={key} data-open={expanded === key}>
        <input
          type="checkbox"
          className={css.cardCheckbox}
          checked={batchSelected.has(entry.entryId)}
          disabled={batchInProgress}
          onChange={() => { toggleSelect(entry.entryId) }}
          aria-label={title}
        />
        <button
          type="button"
          className={css.cardContent}
          aria-expanded={expanded === key}
          aria-label={`${title}, ${stateText}`}
          onClick={() => { toggleRow(key) }}
        >
          <span className={css.cardTitle}>{title}</span>
          <span className={css.cardTrailing}>
            {entry.enabled && !failed && entry.fiberPhase !== null
              ? <PhaseDot phase={entry.fiberPhase} t={t} />
              : null}
            <StateTag kind={kind} label={stateText} />
          </span>
        </button>
        {expanded === key ? (
          <dl className={css.cardDetails}>
            <div><dt>{t('moduleLabel')}</dt><dd>{entry.moduleName}</dd></div>
            <div><dt>{t('runtime')}</dt><dd>{phaseLabel(entry.fiberPhase, t)}</dd></div>
            <div><dt>{t('description')}</dt><dd>{entry.description}</dd></div>
          </dl>
        ) : null}
      </li>
    )
  }

  return (
    <div className={css.section} aria-busy={state.status === 'loading'}>
      {state.status === 'loading' ? <p className={css.status}>{t('loading')}</p> : null}
      {state.status === 'error' ? (
        <div className={css.failure}>
          <p role="alert">{t('error')}</p>
          <button type="button" onClick={retry}>{t('retry')}</button>
        </div>
      ) : null}
      {snapshot !== undefined ? (
        <div className={css.catalog}>
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

          {actionError ? <p className={css.actionError} role="alert">{actionError}</p> : null}

          {/* Install panel */}
          <div className={css.batchToolbar}>
            <button
              type="button"
              className={css.batchSelectBtn}
              onClick={() => { setShowInstall(s => !s) }}
            >
              {t('install')}
            </button>
          </div>
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
                  disabled={!installName.trim() || installInProgress}
                  onClick={() => { void handleInstall() }}
                >
                  {installInProgress ? t('installing') : t('installConfirm')}
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

          {/* Batch toolbar */}
          {filteredEntries.length > 0 ? (
            <div className={css.batchToolbar}>
              <button
                type="button"
                className={css.batchSelectBtn}
                disabled={batchInProgress}
                onClick={batchSelected.size === filteredEntries.length ? clearSelection : selectAllFiltered}
              >
                {batchSelected.size === filteredEntries.length ? t('batchSelectNone') : t('batchSelectAll')}
              </button>
              {batchSelected.size > 0 ? (
                <>
                  <span className={css.batchCount}>
                    {t('batchSelected').replace('{count}', String(batchSelected.size))}
                  </span>
                  <button type="button" className={css.batchEnableBtn} disabled={batchInProgress}
                    onClick={() => { void handleBatch('enable') }}>{t('batchEnable')}</button>
                  <button type="button" className={css.batchDisableBtn} disabled={batchInProgress}
                    onClick={() => { void handleBatch('disable') }}>{t('batchDisable')}</button>
                  <button type="button" className={css.batchUninstallBtn} disabled={batchInProgress}
                    onClick={() => { void handleBatch('uninstall') }}>
                    {batchInProgress ? t('batchInProgress') : t('batchUninstall')}
                  </button>
                </>
              ) : null}
            </div>
          ) : null}

          {thirdPartyEntries.length === 0 ? <p className={css.status}>{t('empty')}</p> : null}
          {thirdPartyEntries.length > 0 && filteredEntries.length === 0 ? (
            <p className={css.status}>{t('emptySearch')}</p>
          ) : null}
          {filteredEntries.length > 0 ? (
            <ul className={css.cards}>
              {filteredEntries.map(entry => rowCard(entry))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <Modal
        open={confirmAction !== null}
        onClose={() => { setConfirmAction(null) }}
        title={confirmAction === 'uninstall' ? t('batchUninstall') : confirmAction === 'enable' ? t('batchEnable') : t('batchDisable')}
        closeLabel={t('cancel')}
        footer={(
          <>
            <Button variant="outline" onClick={() => { setConfirmAction(null) }}>
              {t('cancel')}
            </Button>
            <Button
              variant="primary"
              disabled={batchInProgress}
              onClick={() => { void executeBatch() }}
            >
              {t('batchConfirm')}
            </Button>
          </>
        )}
      >
        <p>{confirmAction === 'enable'
          ? t('batchEnableConfirm').replace('{count}', String(batchSelected.size))
          : confirmAction === 'disable'
            ? t('batchDisableConfirm').replace('{count}', String(batchSelected.size))
            : t('batchUninstallConfirm').replace('{count}', String(batchSelected.size))}</p>
      </Modal>
    </div>
  )
}

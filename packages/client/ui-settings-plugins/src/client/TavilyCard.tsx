/**
 * The Tavily web-search provider's card: its endpoint, its default result
 * budget and extraction depth, and the key — which is written through the
 * credentials domain, never into the settings section, so the literal never
 * rides a response.
 */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { SecretField, ValueField } from './fields.tsx'
import { PluginCard } from './PluginCard.tsx'
import type { TavilyCardFace } from './tavily-card-controller.ts'
import type {} from './slot-contract.ts'

/** Props the renderer binds for the Tavily web-search card. */
export type TavilyCardProps =
  PropsRuntime<'settings.plugin.item'>
  & PropsLocale<'settings.plugins'>
  & InjectFace<TavilyCardFace>

/**
 * Render the Tavily web-search card.
 * @param props - locale copy, the card snapshot, and its form actions.
 * @returns the card.
 */
export function TavilyCard(props: TavilyCardProps) {
  const { t } = props
  const state = props.useTavilyCard(snapshot => snapshot)
  const disabled = !state.writable
  return (
    <PluginCard
      t={t}
      titleKey="tavilyTitle"
      descriptionKey="tavilyDescription"
      state={state}
      onSave={props.save}
      onDiscard={props.discard}
    >
      <SecretField
        id="plugin-config-tavily-key"
        label={t('tavilyApiKey')}
        hint={t('tavilyApiKeyHint')}
        disabled={!state.apiKeyWritable}
        text={state.apiKey.text}
        configured={state.apiKeyConfigured}
        stateLabel={state.apiKeyConfigured ? t('tavilyApiKeySet') : t('tavilyApiKeyUnset')}
        onEdit={(text) => { props.edit('apiKey', text) }}
      />
      <ValueField
        id="plugin-config-tavily-endpoint"
        label={t('tavilyBaseUrl')}
        hint={t('tavilyBaseUrlHint')}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        invalidLabel={t('invalidNumber')}
        disabled={disabled}
        {...state.baseURL}
        onEdit={(text) => { props.edit('baseURL', text) }}
        onReset={() => { props.resetField('baseURL') }}
      />
      <ValueField
        id="plugin-config-tavily-max-results"
        label={t('tavilyMaxResults')}
        hint={t('tavilyMaxResultsHint')}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        invalidLabel={t('invalidNumber')}
        numeric
        disabled={disabled}
        {...state.maxResults}
        onEdit={(text) => { props.edit('maxResults', text) }}
        onReset={() => { props.resetField('maxResults') }}
      />
      <ValueField
        id="plugin-config-tavily-depth"
        label={t('tavilySearchDepth')}
        hint={t('tavilySearchDepthHint')}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        invalidLabel={t('invalidNumber')}
        disabled={disabled}
        {...state.searchDepth}
        onEdit={(text) => { props.edit('searchDepth', text) }}
        onReset={() => { props.resetField('searchDepth') }}
      />
    </PluginCard>
  )
}

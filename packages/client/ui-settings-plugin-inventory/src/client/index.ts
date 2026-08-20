/** Host plugin inventory registered into Web Settings with management operations. */

import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { PluginInventorySettingsTab, type PluginInventorySettingsTabInjected } from './PluginInventorySettingsTab.tsx'
import { en, zh, type PluginInventoryLocaleKey } from './locales.ts'

export type { PluginInventorySettingsTabInjected, PluginInventorySettingsTabProps } from './PluginInventorySettingsTab.tsx'
export type { PluginInventoryLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Plugin inventory copy with management actions. */
    'settings.pluginInventory': PluginInventoryLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.pluginInventory'

/** Services required by the Settings registration and generated Remote face. */
export const inject = ['slots', 'locale', 'remote', 'remote.pluginInventory']

/** Contribute the inventory tab with management operations to the Plugins settings section. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-plugin-inventory: dictionaries')

  const t = ctx.locale.bind(NS)
  const list: PluginInventorySettingsTabInjected['list'] = async () => {
    const result = await ctx.remote.pluginInventory.list()
    if (!result.ok) {
      throw new Error(`pluginInventory.list failed: ${result.error.code}: ${result.error.message}`)
    }
    return result.value
  }
  const setEnabled: PluginInventorySettingsTabInjected['setEnabled'] = async (entryId, enabled) => {
    const result = await ctx.remote.pluginInventory.setEnabled(entryId, enabled)
    if (!result.ok) {
      throw new Error(`pluginInventory.setEnabled failed: ${result.error.code}: ${result.error.message}`)
    }
    return result.value
  }
  const uninstall: PluginInventorySettingsTabInjected['uninstall'] = async (entryId) => {
    const result = await ctx.remote.pluginInventory.uninstall(entryId)
    if (!result.ok) {
      throw new Error(`pluginInventory.uninstall failed: ${result.error.code}: ${result.error.message}`)
    }
    return result.value
  }
  const install: PluginInventorySettingsTabInjected['install'] = async (moduleName) => {
    const result = await ctx.remote.pluginInventory.addPlugin(moduleName)
    if (!result.ok) {
      throw new Error(`pluginInventory.install failed: ${result.error.code}: ${result.error.message}`)
    }
    return result.value
  }
  const injected = (): PluginInventorySettingsTabInjected => ({ list, setEnabled, uninstall, install })

  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'all',
    order: 10,
    label: () => t('tab'),
    locale: NS,
    inject: injected,
  }, PluginInventorySettingsTab))
}

/**
 * `@deepseek-ai/dsh-web-search-tavily`: registers a Tavily-backed
 * `WebSearchProvider` with `ctx.web`. A function/namespace plugin (NOT a
 * default-export service): a search provider does not own the `ctx.web` key —
 * it registers INTO the seam's provider registry, exactly as
 * `@deepseek-ai/dsh-web-search-exa` does for Exa. The key is owned by
 * `@deepseek-ai/dsh-web`.
 *
 * @module @deepseek-ai/dsh-web-search-tavily
 */

import type { Context } from '@deepseek-ai/cordis'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-web'
import {
  TavilySearchProvider,
  TAVILY_DEFAULT_BASE_URL,
  TAVILY_DEFAULT_MAX_RESULTS,
  TAVILY_DEFAULT_SEARCH_DEPTH,
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

/** Plugin config (all optional — `apply` fills env-var and constant defaults). */
export interface Config {
  /** Tavily API key. Falls back to `$TAVILY_API_KEY`. Empty → provider unavailable. */
  apiKey?: string
  /** Endpoint base; `/search` is appended. Defaults to the public API. */
  baseURL?: string
  /** Default result count when a request carries no `maxResults`. Defaults to 5. */
  maxResults?: number
  /** Extraction depth: `basic` or `advanced`. Defaults to `basic`. */
  searchDepth?: 'basic' | 'advanced'
}

export const Config: z<Config> = z.object({
  apiKey: z.string(),
  baseURL: z.string(),
  maxResults: z.number().step(1).min(1),
  searchDepth: z.union(['basic', 'advanced'] as const),
})

/**
 * Register the Tavily search provider with `ctx.web`. The provider's
 * availability is a pure function of its resolved key, so an absent
 * `$TAVILY_API_KEY` (and no config key) makes the provider unavailable — the
 * seam then reports `WEB_PROVIDER_UNAVAILABLE` instead of scrolling.
 *
 * @param ctx - Cordis context carrying the `web` seam.
 * @param config - plugin configuration; all fields optional.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.web.registerSearchProvider(new TavilySearchProvider({
    // Every environment layer may name this key: the product trusts the
    // project it is launched in, and the managed store is not involved here.
    apiKey: config.apiKey ?? launchEnvironmentOf(ctx).get('TAVILY_API_KEY')?.value ?? '',
    baseURL: config.baseURL ?? TAVILY_DEFAULT_BASE_URL,
    maxResults: config.maxResults ?? TAVILY_DEFAULT_MAX_RESULTS,
    searchDepth: config.searchDepth ?? TAVILY_DEFAULT_SEARCH_DEPTH,
  }))
}

/**
 * `TavilySearchProvider`: a `WebSearchProvider` backed by the Tavily search
 * API (`POST /search`). Tavily returns an ordered `results[]` whose `content`
 * is an extract/summary — mapped to `snippet` — plus `title` and `url`; an
 * optional top-level `answer` becomes the normalized `content`. Entries with
 * a blank URL are dropped; the seam owns final `maxResults` truncation.
 * @module @deepseek-ai/dsh-web-search-tavily/provider
 */

import { WebError } from '@deepseek-ai/dsh-web'
import type {
  WebSearchProvider,
  WebSearchRequest,
  WebSearchResult,
  WebSearchSource,
} from '@deepseek-ai/dsh-web'
import type { TavilyError, TavilyResult, TavilySearchRequest, TavilySearchResponse } from './types.ts'

/** Stable id this provider registers under. */
export const TAVILY_PROVIDER_ID = 'tavily'

/** Default Tavily search endpoint; `/search` is the operation. */
export const TAVILY_DEFAULT_BASE_URL = 'https://api.tavily.com'

/** Default result count when a request carries no `maxResults`. */
export const TAVILY_DEFAULT_MAX_RESULTS = 5

/**
 * Default search depth. `basic` costs fewer credits and enough for most
 * lookups; deployments needing deeper extraction set `advanced` in config.
 */
export const TAVILY_DEFAULT_SEARCH_DEPTH = 'basic' as const

/** Attribution header sent on every request. Bump with the package version. */
const USER_AGENT = 'deepseek-harness/0.0.1'

/** Resolved provider options (the plugin's `apply` supplies env-var and constant defaults). */
export interface TavilySearchProviderOptions {
  /** Tavily API key. Empty/absent makes the provider unavailable. */
  apiKey: string
  /** Endpoint base; `/search` is appended. */
  baseURL: string
  /** Default result count sent to Tavily. */
  maxResults: number
  /** `basic` or `advanced` extraction depth. */
  searchDepth: 'basic' | 'advanced'
}

/**
 * Map one Tavily result to a normalized source. A result always has a URL
 * (Tavily guarantees it); entries arriving without one are filtered at the
 * response level. `content` is the extract/summary and becomes the snippet;
 * `title` is preserved when present.
 *
 * @param result - one entry of Tavily's `results[]`.
 * @returns the normalized source.
 */
export function mapTavilyResult(result: TavilyResult): WebSearchSource {
  return {
    url: result.url,
    ...typeof result.title === 'string' && result.title.trim().length > 0 ? { title: result.title } : {},
    ...typeof result.content === 'string' && result.content.trim().length > 0 ? { snippet: result.content } : {},
  }
}

/**
 * Map a Tavily response envelope to a normalized search result. The top-level
 * `answer` (when a deployment enables it) becomes the optional generated
 * `content`; otherwise `content` is omitted. Snippet-less entries from
 * {@link mapTavilyResult} still carry a URL and are kept — the seam renders
 * `title ?? hostname(url)` and can show them without a snippet.
 *
 * @param response - the parsed `POST /search` response body.
 * @returns the normalized result.
 */
export function mapTavilyResponse(response: TavilySearchResponse): WebSearchResult {
  const answer = typeof response.answer === 'string' && response.answer.trim().length > 0
    ? response.answer
    : undefined
  const sources = (response.results ?? [])
    .filter(result => result.url.trim().length > 0)
    .map(mapTavilyResult)
  // The web service owns the final `maxResults` truncation, so this provider
  // reports `truncated: false`.
  return { ...answer !== undefined ? { content: answer } : {}, sources, truncated: false }
}

/** The Tavily-backed search provider. */
export class TavilySearchProvider implements WebSearchProvider {
  readonly id = TAVILY_PROVIDER_ID

  constructor(private readonly options: TavilySearchProviderOptions) {}

  available(): boolean {
    return this.options.apiKey.length > 0
      && isValidBaseUrl(this.options.baseURL)
      && isPositiveInteger(this.options.maxResults)
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    // A per-request bound wins over the configured default.
    const searchRequest: TavilySearchRequest = {
      query: request.query,
      maxResults: request.maxResults ?? this.options.maxResults,
      searchDepth: this.options.searchDepth,
    }
    let response: Response
    try {
      response = await fetch(`${this.options.baseURL}/search`, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'authorization': `Bearer ${this.options.apiKey}`,
          'content-type': 'application/json',
          'accept': 'application/json',
          'user-agent': USER_AGENT,
        },
        body: JSON.stringify(searchRequest),
        ...signal !== undefined ? { signal } : {},
      })
    } catch (error: unknown) {
      if (isAbortError(error)) throw new WebError('Tavily search aborted', 'WEB_ABORTED', { cause: error })
      throw new WebError(`Tavily search request failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }

    if (!response.ok) {
      const status = response.status
      let message = `Tavily API error (HTTP ${status})`
      try {
        const parsed = await response.json() as TavilyError
        const detail = parsed.error ?? parsed.message
        if (detail !== undefined && detail.length > 0) message = detail
      } catch (error: unknown) {
        // An abort fired mid-body must surface as WEB_ABORTED, not be
        // swallowed into a generic HTTP-error message — cancellation is not a
        // provider error (the seam's cancellation contract).
        if (isAbortError(error)) throw new WebError('Tavily search aborted', 'WEB_ABORTED', { cause: error })
        // Otherwise: the HTTP status is already captured in `message` above.
      }
      throw new WebError(message, 'WEB_PROVIDER_ERROR')
    }

    try {
      const payload = await response.json() as TavilySearchResponse
      return mapTavilyResponse(payload)
    } catch (error: unknown) {
      if (isAbortError(error)) throw new WebError('Tavily search aborted', 'WEB_ABORTED', { cause: error })
      throw new WebError(`Tavily returned an unprocessable response body: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
  }
}

/** True when `baseURL` parses as an absolute URL (a cheap local config check). */
function isValidBaseUrl(baseURL: string): boolean {
  return URL.canParse(baseURL)
}

/** True for a result count that can be sent to Tavily (a positive whole number). */
function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0
}

/** True for a fetch/`AbortSignal` abort, surfaced as `WEB_ABORTED`. */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

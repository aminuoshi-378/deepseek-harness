/**
 * Wire vocabulary for the Tavily search API (`POST /search`). Kept
 * provider-private: the normalized shape the seam consumes lives in
 * `@deepseek-ai/dsh-web`; these types describe only what Tavily returns.
 * @module @deepseek-ai/dsh-web-search-tavily/types
 */

/** One result entry in Tavily's `results[]`. */
export interface TavilyResult {
  /** Source title; may be blank for some pages. */
  readonly title: string
  /** Absolute source URL. */
  readonly url: string
  /** Extract or generated summary; may be blank. */
  readonly content: string
  /** Relevance score in `[0, 1]`, higher is more relevant. */
  readonly score: number
}

/**
 * A non-2xx Tavily response envelope. Both `error` (older API) and `message`
 * (newer) variants are tolerated so the adapter stays honest about the failure.
 */
export interface TavilyError {
  /** Legacy error detail field. */
  readonly error?: string
  /** Current error message field. */
  readonly message?: string
}

/** The parsed `POST /search` success envelope. */
export interface TavilySearchResponse {
  /** Search answer when the deployment enables the answer feature. */
  readonly answer?: string
  /** Ordered, relevance-ranked result entries; treated as empty when absent. */
  readonly results?: readonly TavilyResult[]
}

/**
 * The request one search sends, decoupled from `WebSearchRequest` so the API
 * layer owns only the fields Tavily accepts.
 */
export interface TavilySearchRequest {
  readonly query: string
  /** Number of results requested from Tavily (its `max_results`). */
  readonly maxResults: number
  /** `basic` or `advanced`; `advanced` trades cost for richer extraction. */
  readonly searchDepth: 'basic' | 'advanced'
}

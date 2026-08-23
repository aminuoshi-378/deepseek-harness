# @deepseek-ai/dsh-web-search-tavily

English | [中文](README.zh.md)

A [Tavily](https://tavily.com)-backed `WebSearchProvider` for the harness [web capability seam](../web/README.md) (`ctx.web`). It calls Tavily's `POST /search` endpoint and maps the ordered `results[]` into the seam's normalized `WebSearchResult`, promoting Tavily's optional top-level `answer` to the generated `content`.

This is an **implementation** package: it registers a provider into `ctx.web`, it does not own the `ctx.web` key and it does not register a model-facing tool (that is `@deepseek-ai/dsh-tool-web`). Like `@deepseek-ai/dsh-web-search-exa`, it is a function/namespace plugin (`inject: ['web']`) that registers its backend, not a default-export service.

## Config

| Key | Default | Meaning |
|---|---|---|
| `apiKey` | `$TAVILY_API_KEY` | Tavily API key. Empty/absent makes the provider unavailable. |
| `baseURL` | `https://api.tavily.com` | Endpoint base; `/search` is appended. An unparseable value makes the provider unavailable. |
| `maxResults` | `5` | Default result count when a request carries no `maxResults` (Tavily's `max_results`). Must be a positive integer. |
| `searchDepth` | `basic` | Extraction depth sent as Tavily's `search_depth`: `basic` or `advanced`. |

```yaml
- id: web-search-tavily
  name: '@deepseek-ai/dsh-web-search-tavily'
  config:
    apiKey: !!js process.env.TAVILY_API_KEY
```

The provider's availability is set on load from the resolved key. To make search actually run, register this row in a profile and point the `web` row's `searchProvider` at `tavily` (or set `$DSH_WEB_SEARCH_PROVIDER=tavily`).

## Mapping

Tavily returns an ordered `results[]` of `{title, url, content, score}`. Each result maps to a `WebSearchSource`: `url` ← `url`, `title` ← `title` (when non-blank), `snippet` ← `content` (when non-blank); a result whose URL is blank is dropped. An optional top-level `answer` becomes the generated `content`; otherwise `content` is omitted. A request's `maxResults` wins over the configured `maxResults` default and is sent as Tavily's `max_results`; the final bound is enforced by the seam. Provider failures (HTTP errors, network failure, unparseable or wrong-shape bodies) surface as `WebError` `WEB_PROVIDER_ERROR`; an aborted request surfaces as `WEB_ABORTED`. HTTP redirects are rejected before the `Location` target is contacted and surface as `WEB_PROVIDER_ERROR`.

## Model Experience

Indirectly, through [`dsh-tool-web`](../tool-web/README.md), which retains this provider's `maxResults`-bounded URLs, titles, contents/snippets, and the generated `answer` as `content`, or its exact `Tavily search aborted`, `Tavily search request failed: <error>`, and `Tavily returned an unprocessable response body: <error>` failures under the consumer's error wrapper while provider-private fields remain outside context.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

- **Snippet fallback is content-based** — a result whose `content` is blank maps with only a `url` (and `title` when present). Tavily `basic` depth usually returns `content`; `advanced` trades credits for richer extracts.
- **Only `maxResults`/`searchDepth` are exposed** — Tavily's other controls (domains, `days`, `search_type`, `include_answer`, `include_raw_content`) wait on provider-neutral Service Definition fields ([seam Agent Note](../../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.md)).
- **Abort classification is error-shape-based** — only a `DOMException` named `AbortError` maps to `WEB_ABORTED`; an abort carrying a custom reason (e.g. `dsh-timeout`'s `TimeoutReason`) surfaces as `WEB_PROVIDER_ERROR`.
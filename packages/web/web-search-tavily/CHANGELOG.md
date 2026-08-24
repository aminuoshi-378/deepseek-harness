# Changelog

All notable changes to `@deepseek-ai/dsh-web-search-tavily` are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.1-rc.2] - Unreleased

### Added

- `TavilySearchProvider`: a `WebSearchProvider` over Tavily's `POST /search` endpoint, normalized to the web capability seam (`ctx.web`). Key resolved per request from the credentials domain (named by `apiKeyEnv`, default `TAVILY_API_KEY`) with a literal `apiKey` fallback.
- Plugin wiring: `web-search-tavily` registers the provider into `ctx.web` and exposes a hot-reloaded `web-search-tavily` settings section (`baseURL`, `maxResults`, `searchDepth`) through the shared settings seam.
- Base profile wiring: `web-search-tavily` added to the base bundle, and the base `web` row's `searchProvider` now points at `tavily`.
- Browser settings card: a configurable Tavily card in the Plugins settings tab, editing endpoint, default result count, extraction depth, and the API key (written through the credentials domain). The card shows provider defaults (`5`, `basic`) when the section carries no value.
- Unit tests (23) covering result mapping, availability, request serialization, error/abort classification, endpoint normalization, and plugin registration.

### Fixed

- Endpoint normalization (`searchEndpoint`): a configured `baseURL` is accepted with or without a trailing slash and with or without a literal `/search` path, so a user who pastes the full operation path no longer produces a double `search/search` request.
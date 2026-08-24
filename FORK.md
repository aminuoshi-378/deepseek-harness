# DeepSeek Harness — Fork Differences

This fork (`aminuoshi-378/deepseek-harness`) adds a set of local enhancements and fixes on top of the official [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Everything upstream remains: the plugin-based architecture, the CLI, the Web UI, and the SDKs. This document lists only what differs from the official repo.

> Replace the upstream URL in [README.md](README.md) clone instructions when you use this fork, or keep it as is and link here.

## Search & Web

### Tavily search provider (new)
- New package `@deepseek-ai/dsh-web-search-tavily`: a `WebSearchProvider` over Tavily's `POST /search` endpoint.
- Config via a hot-reloaded `web-search-tavily` settings section and a settings card in the Web UI (Plugins tab): endpoint, default result count, extraction depth, and API key (stored in the credentials domain, not the settings file).
- Endpoint normalization accepts a base with or without a trailing slash and with or without `/search`, so misconfigured values still resolve.
- The base profile's `web.searchProvider` now points at `tavily`.
- See [packages/web/web-search-tavily/README.md](packages/web/web-search-tavily/README.md) and [packages/web/web-search-tavily/CHANGELOG.md](packages/web/web-search-tavily/CHANGELOG.md).

### Web search provider roster
The base `dsh-web` seam keeps the official built-in providers (DeepSeek, Exa, Perplexity). This fork makes **Tavily** the primary route, while the DeepSeek and Exa routes remain loadable.

## Model selection UI

### Model search + provider filter
- The model selector gained a free-text search box and a provider (vendor) dropdown, so the model list filters by vendor and by name.
- The two filter controls are rendered as chip-style triggers that open an in-place Menu dropdown, so they follow the active theme/skin (previously a browser-native `<select>` showed a white popup on green/blue skins).

### Provider dropdown scroll
- The provider dropdown scrolls internally (mouse wheel and scrollbar) when many vendors exist, without clipping under the panel.

## Plugins settings

### Plugin batch actions (bulk operations)
- The plugin-inventory settings gained bulk selection and bulk management (enable/disable/remove) actions.

### Persist disabled state
- The disabled state of a plugin is persisted to the user patch layer so it survives restarts.

## CI

### E2E job disabled on this fork
- Because repo secrets are not inherited by forks, the `e2e` workflow used to hard-fail its preflight (missing `DEEPSEEK_API_KEY_EXTERNAL`). The job is now `if: false`, so it reports `skipped` and never fires real DeepSeek API calls. Restore the condition and add the fork secret to re-enable. See [.github/workflows/e2e.yml](.github/workflows/e2e.yml).

## Documentation

- README clone URL and the build/run instructions cover this fork's source layout plus platform-specific (macOS/Linux/Windows) steps.

## Tracking

- The `feat/web-search-tavily` branch carries the Tavily provider and its settings card; master already contains the older model-selector and plugin-inventory work. See [CHANGELOG.md](packages/web/web-search-tavily/CHANGELOG.md) for the Tavily package history.
# @deepseek-ai/dsh-host-plugin-inventory

English | [中文](README.zh.md)

Host projection of the current Cordis Loader tree with management operations. `PluginInventoryGateway` registers the `pluginInventory` service and publishes generated direct Remotes:

- `pluginInventory/list` — reads `ctx.loader.entries()` directly, skips structural group rows, and returns the remaining entries in Loader order with their Loader entry id, module specifier, effective enablement, current root Fiber phase, inferred source (builtin/third-party), functional type, and a short description.
- `pluginInventory/setEnabled` — toggles a plugin entry's enabled state by updating its Loader options via `loader.update()`.
- `pluginInventory/install` — creates a new plugin entry in the Loader's root group via `loader.create()`.
- `pluginInventory/uninstall` — removes a plugin entry from the Loader via `loader.remove()`. Built-in plugins (dsh-* / cordis-*) are protected from removal.

The phase is `pending`, `loading`, `active`, `failed`, or `unloading`; it is `null` when the entry has no live root Fiber. The snapshot is intentionally point-in-time: Loader remains the sole lifecycle authority, while this package owns no cache, history, or event stream. Its public payload types live under `./types`, and Typert generates the Host and Client Remote artifacts exposed by `./typert` and `./remote`.

The service is Remote-only and deliberately declares no same-process Cordis `Context` merge. Client packages consume it through the explicit [`api-remotes`](../../api/remotes/README.md) assembly rather than importing the Host implementation.

## Model Experience

None, as this Host-only inventory projection registers no prompt, tool, message, or provider request.

#### KV Cache effect

None; this package never assembles model input.

## Known Limitations and Deferred Work

- **Point-in-time state only** — the result contains no durable failure history or subscription; a missing root Fiber is reported as `null`, regardless of why no live root exists.
- **Heuristic source and type inference** — `source` and `type` are inferred from the module name and may not perfectly classify every plugin.
- **No provenance** — the service does not identify which bundle, profile, or override introduced an entry.

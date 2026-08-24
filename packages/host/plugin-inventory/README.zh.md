# @deepseek-ai/dsh-host-plugin-inventory

[English](README.md) | 中文

当前 Cordis Loader 树的 Host 投影，支持管理操作。`PluginInventoryGateway` 注册 `pluginInventory` 服务，并发布由 Typert 生成的直接 Remote：

- `pluginInventory/list` —— 直接读取 `ctx.loader.entries()`，跳过结构性的 group 行，再按 Loader 顺序返回其余条目，包含 Loader 条目 id、模块标识、有效启用状态、当前根 Fiber 阶段、推断的来源（内置/第三方）、功能类型和简短描述。
- `pluginInventory/setEnabled` —— 通过 `loader.update()` 切换插件条目的启用状态。
- `pluginInventory/install` —— 通过 `loader.create()` 在 Loader 的根 group 中创建新插件条目。
- `pluginInventory/uninstall` —— 通过 `loader.remove()` 从 Loader 中移除插件条目。内置插件（dsh-* / cordis-*）受保护，不可移除。

阶段为 `pending`、`loading`、`active`、`failed` 或 `unloading`；条目没有存活的根 Fiber 时则为 `null`。该快照刻意只表示调用当下：Loader 仍是唯一的生命周期权威，本包不拥有缓存、历史或事件流。公开 payload 类型位于 `./types`，Typert 生成由 `./typert` 与 `./remote` 导出的 Host 和 Client Remote 产物。

该服务仅供 Remote 使用，刻意不声明同进程 Cordis `Context` merge。Client 包通过显式的 [`api-remotes`](../../api/remotes/README.zh.md) 组合消费它，而不导入 Host 实现。

## 模型体验

无，因为这个仅限 Host 的清单投影不注册提示词、工具、消息或提供方请求。

#### KV Cache 影响

无；本包从不组装模型输入。

## 已知限制与暂缓事项

- **仅表示调用当下** —— 结果不包含持久的失败历史或订阅；只要不存在存活的根 Fiber，就会报告 `null`，而不区分其原因。
- **来源与类型为启发式推断** —— `source` 和 `type` 从模块名推断，可能无法完美分类每个插件。
- **无来源追溯** —— 服务不识别条目由哪个 bundle、profile 或 override 引入。

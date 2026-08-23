# @deepseek-ai/dsh-web-search-tavily

[English](README.md) | 中文

由 [Tavily](https://tavily.com) 支持的 `WebSearchProvider`，用于 harness [web 能力 seam](../web/README.zh.md)（`ctx.web`）。它调用 Tavily 的 `POST /search` 端点，把有序 `results[]` 映射为 seam 规范化的 `WebSearchResult`，并将 Tavily 可选的顶层 `answer` 提升为生成的 `content`。

这是一个**实现**包：它向 `ctx.web` 注册提供方，不拥有 `ctx.web` 键，也不注册面向模型的工具（后者属于 `@deepseek-ai/dsh-tool-web`）。与 `@deepseek-ai/dsh-web-search-exa` 一样，它是函数／命名空间插件（`inject: ['web']`），负责注册后端，而非默认导出服务。

## 配置

| 配置键 | 默认值 | 含义 |
|---|---|---|
| `apiKey` | `$TAVILY_API_KEY` | Tavily API 密钥。为空或缺失时提供方不可用。 |
| `baseURL` | `https://api.tavily.com` | 端点基址；追加 `/search`。无法解析时提供方不可用。 |
| `maxResults` | `5` | 请求不含 `maxResults` 时使用的默认结果数（Tavily `max_results`）。必须是正整数。 |
| `searchDepth` | `basic` | 以 Tavily `search_depth` 发送的提取深度：`basic` 或 `advanced`。 |

```yaml
- id: web-search-tavily
  name: '@deepseek-ai/dsh-web-search-tavily'
  config:
    apiKey: !!js process.env.TAVILY_API_KEY
```

提供方的可用性在加载时依据解析出的密钥确定。要让搜索真正运行，需在某个 profile 中注册此行，并把 `web` 行的 `searchProvider` 指向 `tavily`（或设置 `$DSH_WEB_SEARCH_PROVIDER=tavily`）。

## 映射

Tavily 返回有序 `results[]`，每项为 `{title, url, content, score}`。每项结果映射为 `WebSearchSource`：`url` ← `url`、`title` ← `title`（非空白时）、`snippet` ← `content`（非空白时）；URL 为空白的项会被丢弃。可选的顶层 `answer` 成为生成的 `content`；否则省略 `content`。请求的 `maxResults` 优先于已配置的默认 `maxResults`，并作为 Tavily `max_results` 发送；最终上限由 seam 强制执行。提供方失败（HTTP 错误、网络失败、响应体无法解析或结构不符）以 `WebError` `WEB_PROVIDER_ERROR` 呈现；中止请求以 `WEB_ABORTED` 呈现。HTTP 重定向会在访问 `Location` 指向的目标之前被拒绝，并以 `WEB_PROVIDER_ERROR` 呈现。

## 模型体验

通过 [`dsh-tool-web`](../tool-web/README.zh.md) 间接影响；该工具保留此提供方经 `maxResults` 限制的 URL、标题、内容／snippet，以及生成的 `answer` 作为 `content`，或将确切的错误消息 `Tavily search aborted`、`Tavily search request failed: <error>` 和 `Tavily returned an unprocessable response body: <error>` 置于消费方的错误包装层内；提供方私有字段不进入上下文。

#### KV Cache 影响

不会直接导致 KV Cache 失效；请求前缀变更由上述消费方负责。

## 已知限制与暂缓事项

- **snippet 回退依赖 `content`**：`content` 为空的结果只携带 `url`（有时还有 `title`）映射。Tavily `basic` 深度通常返回 `content`；`advanced` 用更多额度换取更丰富的摘要。
- **只公开 `maxResults`／`searchDepth`**：Tavily 的其他控制项（域名、`days`、`search_type`、`include_answer`、`include_raw_content`）等待提供方无关的 Service Definition 字段（见 [seam Agent Note](../../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.zh.md)）。
- **按错误形状分类中止**：只有 `DOMException` 且名为 `AbortError` 时才映射为 `WEB_ABORTED`；携带自定义原因的中止（例如 `dsh-timeout` 的 `TimeoutReason`）会呈现为 `WEB_PROVIDER_ERROR`。
# Phase 4 Provider 能力探针报告

> 状态：等待真实凭据。本文只记录无凭据实现与 Mock 证据，不把未运行的真实端点能力写成事实。

## 固定端点与模型配置

| Provider   | 固定 ChatCompletions endpoint                   | 当前默认 model                                | 数据流向                |
| ---------- | ----------------------------------------------- | --------------------------------------------- | ----------------------- |
| DeepSeek   | `https://api.deepseek.com/chat/completions`     | `deepseek-v4-flash`（可选 `deepseek-v4-pro`） | DeepSeek 官方端点       |
| UUAPI      | `https://uuapi.net/v1/chat/completions`         | 无通用默认；可手填，留空时探针先从 `/v1/models` 自动选择 | 中转/聚合，可能转交上游 |
| OpenRouter | `https://openrouter.ai/api/v1/chat/completions` | `~openai/gpt-latest`，真实能力仍须探针        | 中转/聚合，可能转交上游 |

v1 不允许自定义 Base URL。DeepSeek 适配器拒绝已停用的 `deepseek-chat` / `deepseek-reasoner` 别名，并拒绝图像输入。

## 无凭据完成项

- 三个独立适配器均已实现固定 endpoint、请求组装、非流式响应、SSE、usage、工具调用、错误映射和按 request ID 取消。
- Provider Manager 已实现：文本/视觉默认路由、手动覆盖优先、未探针阻断、视觉 Capability 护栏、单 Provider 失败禁用。
- 探针框架覆盖：模型列表、文本、流式、取消、图像、工具调用、结构化输出、usage、真实错误格式。
- 限流映射由三适配器的 `429 + Retry-After` Mock 验证；真实探针只在端点自然返回限流时标记 `rateLimitFormat=true`，不会主动制造限流。
- Options Key 为 password input；保存经 Options-only credential-store 后立即清空，重读仅由 Background 返回尾四位掩码。

## 当前真实能力状态

| Provider   | 文本   | 流式   | 取消   | 视觉       | 工具   | 结构化 | usage  | 错误格式 | 限流格式 |
| ---------- | ------ | ------ | ------ | ---------- | ------ | ------ | ------ | -------- | -------- |
| DeepSeek   | 未探针 | 未探针 | 未探针 | 明确不路由 | 未探针 | 未探针 | 未探针 | 未探针   | 未触发   |
| UUAPI      | 未探针 | 未探针 | 未探针 | 未探针     | 未探针 | 未探针 | 未探针 | 未探针   | 未触发   |
| OpenRouter | 未探针 | 未探针 | 未探针 | 未探针     | 未探针 | 未探针 | 未探针 | 未探针   | 未触发   |

真实 Key 填入后，在 Options 页运行一次“真实能力探针”。探针结果写入 `chrome.storage.local` 的非敏感 `provider:probes:v1` 记录，并驱动 Panel 的可选/禁用状态；Key 本身不会进入报告、消息、UI 状态或日志。

## 核实来源

- DeepSeek 官方 Change Log：<https://api-docs.deepseek.com/updates/>
- DeepSeek 官方模型与定价：<https://api-docs.deepseek.com/quick_start/pricing/>
- OpenRouter 官方 Quickstart：<https://openrouter.ai/docs/quickstart>
- OpenRouter 官方 Models API：<https://openrouter.ai/docs/guides/overview/models>
- UUAPI 文档入口：<https://uuapi.net/docs>

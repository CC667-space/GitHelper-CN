# Phase 4 Provider 能力探针报告

> 状态：首轮真实探针已执行。本文只把用户从扩展 Options UI 复核到的结果写成事实；未在 UI 暴露的细项不作推断。

## 固定端点与模型配置

| Provider   | 固定 ChatCompletions endpoint                   | 当前默认 model                                | 数据流向                |
| ---------- | ----------------------------------------------- | --------------------------------------------- | ----------------------- |
| DeepSeek   | `https://api.deepseek.com/chat/completions`     | `deepseek-v4-flash`（可选 `deepseek-v4-pro`） | DeepSeek 官方端点       |
| UUAPI      | `https://uuapi.net/v1/chat/completions`         | 无通用默认；可手填，留空时探针先从 `/v1/models` 自动选择 | 中转/聚合，可能转交上游 |
| OpenRouter | `https://openrouter.ai/api/v1/chat/completions` | 文本默认 `~openai/gpt-latest`；视觉探针会依据 `/models` 的 `input_modalities` 自动选择兼容型号 | 中转/聚合，可能转交上游 |

v1 不允许自定义 Base URL。DeepSeek 适配器拒绝已停用的 `deepseek-chat` / `deepseek-reasoner` 别名，并拒绝图像输入。

DeepSeek V4 的官方 ChatCompletions 文档显示 Thinking 默认为 enabled，且 `max_tokens` 同时覆盖 reasoning 与最终回答。前三轮文本探针只给 16 tokens；其 HTTP 请求未返回 401/403，但最终 `content` 为空。适配器现显式发送 `thinking: { type: "disabled" }`，以匹配低成本默认文本路线；该修复的真实结果仍待 DeepSeek 单家复测。

## 无凭据完成项

- 三个独立适配器均已实现固定 endpoint、请求组装、非流式响应、SSE、usage、工具调用、错误映射和按 request ID 取消。
- Provider Manager 已实现：文本/视觉默认路由、手动覆盖优先、未探针阻断、视觉 Capability 护栏、单 Provider 失败禁用。
- 探针框架覆盖：模型列表、文本、流式、取消、图像、工具调用、结构化输出、usage、真实错误格式。
- 限流映射由三适配器的 `429 + Retry-After` Mock 验证；真实探针只在端点自然返回限流时标记 `rateLimitFormat=true`，不会主动制造限流。
- Options Key 为 password input；保存经 Options-only credential-store 后立即清空，重读仅由 Background 返回尾四位掩码。

## 当前真实能力状态

### 首轮真实探针（2026-07-24）

| Provider   | UI 状态   | 文本             | 视觉             | UI 显示的失败原因 |
| ---------- | --------- | ---------------- | ---------------- | ----------------- |
| DeepSeek   | disabled  | 未验证/不可用    | 明确不路由       | 文本探针失败      |
| UUAPI      | disabled  | 未验证/不可用    | 未验证/不支持    | `UUAPI: HTTP 502` |
| OpenRouter | available | **已验证**       | 未验证/不支持    | 无                |

结论：

- 文本硬门槛已有 OpenRouter 通过。
- 视觉硬门槛首轮未通过，触发 D-031 条件性暂停。
- 首轮之后发现两项会造成视觉假阴性的实现风险：样例图仅 `1×1` 像素；探针虽然读取 `/models`，却没有在已配置型号不支持图像时改用声明 `image` 输入的型号。
- 修复版改用 `32×32` PNG；当已配置视觉型号在模型元数据中明确不含 `image` 时，自动选择 `/models` 返回的图像输入型号，并在通过后保存该型号。

### 第二轮真实探针（2026-07-24）

| Provider   | UI 状态   | 文本             | 视觉             | UI 显示的失败原因 |
| ---------- | --------- | ---------------- | ---------------- | ----------------- |
| DeepSeek   | disabled  | 未验证/不可用    | 明确不路由       | 文本探针失败；未配置视觉模型或样例图 |
| UUAPI      | disabled  | 未验证/不可用    | 未验证/不支持    | `UUAPI: All available accounts exhausted`；未配置视觉模型或样例图 |
| OpenRouter | available | **已验证**       | 未验证/不支持    | `模型 ~openai/gpt-latest 返回空内容` |

第二轮结论：

- `~openai/gpt-latest` 的模型元数据允许视觉请求，但本轮实际返回空内容；仅依赖声明能力仍可能产生假阴性。
- 能力探针现支持明确备用视觉模型：首选型号报错或返回空内容时，改用 `openrouter/free` 重试；通过后将实际可用型号保存为视觉模型。
- `openrouter/free` 是 OpenRouter 官方免费模型路由，并会按图像理解等请求能力筛选可用免费模型。需要一次新的真实探针验证该备用路线；未验证前仍不声明视觉可用。

### 第三轮真实探针（2026-07-24）

| Provider   | UI 状态   | 文本             | 视觉             | UI 显示的失败原因 |
| ---------- | --------- | ---------------- | ---------------- | ----------------- |
| DeepSeek   | disabled  | 未验证/不可用    | 明确不路由       | 文本探针失败；未配置视觉模型或样例图 |
| UUAPI      | available | **已验证**       | 未验证/不支持    | 未配置视觉模型或样例图 |
| OpenRouter | available | **已验证**       | **已验证**       | 无 |

第三轮结论：

- D-031 真实端点硬门槛已通过：文本有 UUAPI/OpenRouter；视觉有 OpenRouter。
- DeepSeek 单家失败按 D-031 记录并禁用，不阻塞 Phase 4。
- OpenRouter 视觉路线在带 `openrouter/free` fallback 的修复版中通过；具体由首选别名还是 fallback 响应，Options 紧凑状态未回传该细节，因此报告不作超出 UI 证据的归因。

### 第四轮：DeepSeek 定向复测（2026-07-24）

- 高置信根因：V4 默认 Thinking 与探针的 16-token 总输出预算冲突，reasoning 可能先耗尽预算，导致最终正文为空。
- 代码修复：DeepSeek 适配器显式使用非思考模式；不读取、不回显 `reasoning_content`。
- 成本控制：Options 新增单 Provider 复测按钮。点击 DeepSeek 卡片的“仅复测 DeepSeek”时，不调用 UUAPI/OpenRouter，且保留两家的既有探针结果。
- 真实结果：DeepSeek 文本显示“已验证”，视觉显示“未验证/不支持”；视觉失败原因是“未配置视觉模型或样例图”，符合 DeepSeek 不承担视觉路由的设计。
- 结论：D-039 修复得到真实端点验证，DeepSeek 恢复为可用的低成本默认文本 Provider。

### DeepSeek 真实流式对话（2026-07-24）

- 首轮真实对话成功：用户在公开 GitHub Explore 页面选择 DeepSeek，回答以流式方式完整显示。
- 首轮完成后 Panel 的 Background port 断开，圆点变黄且无法发送第二轮；这是连接生命周期问题，不是 DeepSeek 请求失败。
- D-041 已增加 250ms 起步、最高 5s 的自动重连；Mock 生命周期与全量测试通过后，用户完成连续两轮 DeepSeek 对话，第二轮发送和回答均成功。
- 助手输出已增加 D-042 安全 Markdown/GFM 渲染；这是本地显示层变更，不改变 Provider 请求或探针能力结论。

探针结果写入 `chrome.storage.local` 的非敏感 `provider:probes:v1` 记录，并驱动 Panel 的可选/禁用状态；Key 本身不会进入报告、消息、UI 状态或日志。完整探针详情不跨 64KB 扩展消息，只回传紧凑 Provider 状态。

## 核实来源

- DeepSeek 官方 Change Log：<https://api-docs.deepseek.com/updates/>
- DeepSeek 官方模型与定价：<https://api-docs.deepseek.com/quick_start/pricing/>
- DeepSeek 官方 ChatCompletions：<https://api-docs.deepseek.com/api/create-chat-completion>
- DeepSeek 官方 Thinking Mode：<https://api-docs.deepseek.com/guides/thinking_mode>
- OpenRouter 官方 Quickstart：<https://openrouter.ai/docs/quickstart>
- OpenRouter 官方 Models API：<https://openrouter.ai/docs/guides/overview/models>
- OpenRouter 官方 Free Models Router：<https://openrouter.ai/openrouter/free>
- UUAPI 文档入口：<https://uuapi.net/docs>

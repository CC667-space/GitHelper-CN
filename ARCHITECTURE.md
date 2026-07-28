# ARCHITECTURE.md — 系统架构、数据模型与权限设计

> 依附于 `PROJECT_BASELINE.md`。架构级方向变更须确认；内部实现变更记 `DECISIONS.md`。
> v1.1（2026-07-24）：按修订任务单 P0-1/3/4/6/7、C-1/3、P1-1/3/4 修订。
> v1.2（2026-07-24）：截图坐标换算改由 Phase 0 探针 B 实测决定（D-029）；工具白名单 openPage 拆分限域（D-013R）；GitHub API 限流按 resource 分桶（D-032）；manifest 增加 `minimum_chrome_version: "114"`（D-035）；数据清除三分（D-033）。

---

## 1. 整体架构（MV3 四端）

```
┌──────────────────────────────────────────────────────────────┐
│                        Chrome 浏览器                            │
│                                                                │
│  ┌─────────────────┐         ┌──────────────────────────────┐ │
│  │  GitHub 页面     │         │   Side Panel (React UI)       │ │
│  │  Content Script  │◄──────► │   - 会话/消息流                │ │
│  │  (不可信边界,     │  msg    │   - Provider 手动切换下拉      │ │
│  │   无凭据访问)     │         │   - 点击/框选触发按钮          │ │
│  │  - 页面类型识别   │         │   - 一键仓库分析               │ │
│  │  - DOM 解析      │         │   - 截图裁剪(可信上下文)       │ │
│  │  - 点击/框选叠层  │         └───────────────┬──────────────┘ │
│  │  - 高亮/滚动     │                         │ msg             │
│  │  - 选区坐标上报   │                         │                 │
│  └────────┬────────┘                         ▼                 │
│           │ msg        ┌────────────────────────────────────┐ │
│           └──────────► │   Background Service Worker         │ │
│                        │   (消息路由中枢 / 无常驻状态)         │ │
│                        │   - MessageRouter(来源+Schema校验)   │ │
│                        │   - ContextBuilder(数据最小化)       │ │
│                        │   - Sanitizer(敏感信息遮蔽)          │ │
│                        │   - ProviderManager(Capability路由)  │ │
│                        │   - CredentialStore(凭据独立访问)    │ │
│                        │   - GitHubApiClient(匿名+限流+缓存)  │ │
│                        │   - ToolExecutor(白名单)             │ │
│                        │   - captureVisibleTab(截图)          │ │
│                        │   - SessionStore / PrefsStore        │ │
│                        └───────────────┬────────────────────┘ │
│                                        │ HTTPS(仅白名单Host)    │
│                       ┌────────────────┼───────────────┐       │
│                       ▼                ▼               ▼       │
│               DeepSeek API      UUAPI(uuapi.net)   OpenRouter  │
│               (文本默认)         (高质量/视觉)       (兜底)      │
│                       [固定端点预设, 不可自定义 Base URL]        │
│                                                                │
│                     GitHub REST API (匿名, 无 Token)           │
│                                                                │
│  ┌──────────────┐                                              │
│  │ Options 页    │  Provider/Key/偏好/数据清除/数据流向披露      │
│  └──────────────┘                                              │
└──────────────────────────────────────────────────────────────┘
  持久层：chrome.storage.local — setAccessLevel('TRUSTED_CONTEXTS')
         (凭据与普通数据分区; Content Script 无访问权)
```

**为什么 Background 做中枢**：凭据与网络调用集中一处，统一遮蔽/限流/Host 白名单；Content Script 运行在网页边界附近，视为**不可信上下文**，不持有任何凭据（SECURITY 第 3 节）。

---

## 2. 模块职责

| 模块 | 位置 | 职责 |
|---|---|---|
| `content/detector` | content | 按 URL+DOM 特征识别 GitHub 页面类型 |
| `content/parsers/*` | content | 每页面类型一个解析器，产出结构化 PageContext |
| `content/selection` | content | 点击提问叠层 + 框选叠层，产出 SelectedElement / SelectedRegion；框选时上报矩形坐标 + 滚动 + 缩放 + devicePixelRatio |
| `content/actions` | content | 高亮、滚动到元素（**不含截图**，见 3.5） |
| `content/spa-watcher` | content | 监听 SPA 路由变化，触发上下文刷新（见 3.10） |
| `background/router` | bg | 消息路由中枢：来源校验 + 消息 Schema 校验 + 载荷/超时限制 |
| `background/context-builder` | bg | 组装最小化上下文 |
| `background/sanitizer` | bg | 发送前敏感信息检测与遮蔽 |
| `background/provider-manager` | bg | Provider 实例化、Capability 路由、手动覆盖、视觉护栏、Host 白名单 |
| `background/providers/*` | bg | DeepSeek / UUAPI / OpenRouter 实现（各自声明 Capabilities） |
| `background/credential-store` | bg | 凭据独立存储访问接口；仅可信上下文可导入（Options 只 write/delete，Background 只 read/inject；Content Script 禁止导入，lint 边界保护，D-028） |
| `background/capture` | bg | `captureVisibleTab` 截图 + 按 Content 上报的坐标裁剪 |
| `background/github-api` | bg | 匿名 REST 请求、按 resource 分桶限流（core/search/code_search）、缓存、降级（D-032） |
| `background/tools` | bg | 工具白名单注册 + zod 参数校验 + 执行分发 |
| `background/session-store` | bg | 会话 CRUD、摘要、上下文长度控制、容量淘汰 |
| `background/prefs-store` | bg | 长期偏好读写 |
| `panel/*` | panel | React UI（可信上下文）：会话、消息流、Provider 下拉、分析面板、确认弹窗 |
| `options/*` | options | Provider/Key/偏好/数据清除/数据流向披露 |
| `lib/storage` | shared | chrome.storage 封装 + schemaVersion + 迁移 + 容量检查 |
| `lib/messaging` | shared | 类型化消息协议（版本/请求ID/Schema/最大载荷/超时/错误类型） |
| `lib/logger` | shared | 分级日志（强制脱敏） |
| `lib/types` | shared | 全局数据模型类型 |

---

## 3. 关键流程

### 3.1 消息流（统一信封，P1-3）
所有跨端消息用类型化信封：
```ts
interface Envelope<T> {
  v: 1;                 // 协议版本
  id: string;           // 请求 ID（关联响应）
  type: string;         // 固定消息类型
  payload: T;           // 经 zod 校验
  timestamp: string;
}
```
- 收端（尤其 SW）**必须**：校验 `sender` 来源（github.com tab 的 content script / 本扩展页面）、校验 payload Schema、拒绝超过最大载荷的消息、有超时与类型化错误。
- **SW 不接受 Content Script 提供的任意 URL 代为 fetch**；出站域名必须命中 Provider Host 白名单或 `api.github.com`。
- 凭据永不出现在消息载荷中。
- Panel↔Background 用长连接 `chrome.runtime.connect`（流式 token 推送）。
- 扩展 action 与 `Alt+Shift+G` 是产品级 Side Panel 入口，用户手势中直接调用 `chrome.sidePanel.open({tabId})`；Phase 0 技术探针不挂载到产品入口。
- React effect 每次建立的 Panel 长连接具有独立有效期；清理后的旧连接即使延迟触发 `onDisconnect`，也不能改写当前连接状态（D-040）。
- Background port 断开后 Panel 以 250ms 起步、最高 5s 的指数退避自动重连；主动卸载停止重连，不用心跳强行常驻 MV3 Service Worker（D-041）。
- Panel 输入语义：`Enter` 发送、`Shift+Enter` 换行；IME 合成期间 Enter 保留给输入法。
- 助手输出经安全 Markdown/GFM 组件渲染；原始 HTML 跳过、远程图片阻断、链接不可点击，避免模型文本触发代码、隐式网络或绕过导航策略（D-042）。

### 3.2 AI 请求流
```
用户在 Panel 提问
  → Panel 发 ASK 消息(含当前 Provider 手动选择) 给 Background
  → Background 向 Content 请求当前 PageContext（DOM 优先; 私有页面→零出站阻断）
  → ContextBuilder 组装最小上下文
  → Sanitizer 遮蔽敏感信息
  → ProviderManager 选定 Provider(手动优先→默认路由; Capability 校验:
      需要视觉但该 Provider capabilities.supportsVision=false → 阻止并提示)
  → CredentialStore 取 Key(仅此处) → Provider.chatStream() 直连预设 Host
  → token 流式回传 Panel 渲染(支持 Abort/超时/最大负载)
  → 若模型请求工具调用 → ToolExecutor 校验+执行 → 结果回灌模型
  → 完成后写入 SessionStore
```

### 3.3 点击提问流
```
用户点"点击提问" → Panel 通知 Content 进入 pick 模式
  → Content 叠层高亮可选元素 → 用户点击目标
  → Content 提取 SelectedElement(类型/文字/href/sourceUrl/安全属性/邻近上下文/页面类型)
  → 经 Background zod 校验后回传 Panel 展示"已选中"
  → 用户提问 → Background 重读当前 PageContext 并校验 sourceUrl 未过期
  → ContextBuilder 将所选元素标为不可信页面数据 → 走 AI 请求流
```

pick 用捕获阶段拦截 click，选中时阻止原页面动作；Escape、Panel 取消、SPA 失效和 Panel
断开都会清理监听与叠层。嵌套节点优先归一到最近的链接/按钮/表单控件；属性只保留 allowlist，
password input 不读取 value。`sourceUrl` 与发送时页面不一致则丢弃旧选择（D-045）。

### 3.4 框选提问流
```
用户点"框选提问" → Content 进入 drag 模式画矩形
  → 优先提取矩形内文字/链接/代码/按钮/HTML 结构/邻近上下文 → SelectedRegion
  → 本地充分性规则: 文字≥80 / 代码≥8 / 链接+按钮≥2，任一满足即不截图
  → 若结构化信息不足 → Panel 明确提示视觉 Provider 与可能费用
    → 用户发送后走截图流程(3.5)
    → 视觉 Provider(Capability 护栏) → AI 请求流
```

`needsVision` 不是可自由信任的布尔值：Content 与 Background 共用同一充分性函数，消息 zod
要求字段与实际结构一致。`visionEnabled=false` 在会话写入、截图和 Provider 调用前阻断（D-046）。

### 3.5 截图流程（v1.2 修正坐标换算方法论，P0-4 / D-029）
职责划分：
1. **Content Script（不可信侧）只负责**：选择遮罩、记录框选矩形（视口坐标）、上报页面滚动位置 / 浏览器缩放 / `devicePixelRatio` / 视口 CSS 尺寸 / 选区 DOM 内容。**不调用截图 API**。
2. **Background SW（可信侧）负责**：调用 `chrome.tabs.captureVisibleTab()` 获取可见区截图 → 按坐标换算裁剪 → 压缩 → base64 → 决定是否发送给视觉 Provider。
3. **坐标换算方法（Phase 0 探针 B 已定稿，D-029 / D-036）**：
   - `scaleX = capturedWidth / viewport.cssWidth`，`scaleY = capturedHeight / viewport.cssHeight`；X/Y 必须分别按实际尺寸计算。
   - `pixelRect = { x: round(rect.x × scaleX), y: round(rect.y × scaleY), width: round(rect.width × scaleX), height: round(rect.height × scaleY) }`，随后 clamp 到截图边界，空矩形拒绝裁剪。
   - `rect` 来自 `getBoundingClientRect()`，是**视口坐标**：**不扣除 scroll**，也**不做 GitHub 固定页头补偿**。只有未来明确接收文档坐标时才另行换算。
   - 2026-07-24 实测：Windows 1.5× DPI + Chrome 125% zoom + 页面滚动 + Side Panel 开启时，截图 `1560×1347 px`、viewport `832×718 CSS px`，`scaleX=1.875`、`scaleY≈1.8760446`；三个不同位置元素均像素级对齐。完整证据见 `scripts/probe-results.md`。
4. 截图不落盘、不持久保存、用后即弃（P1-1）。
5. **Phase 0 探针 B 必须覆盖**：Windows 高 DPI、浏览器缩放、页面滚动、`devicePixelRatio`、Side Panel 开启时的可见区域变化、GitHub 固定页头/动态布局，并在真实 GitHub 页面取 3 个不同位置元素验证裁剪对齐。

**Phase 7 实现定稿（D-046）**：裁剪前再次确认活动 GitHub tab 与 `SelectedRegion.sourceUrl`
一致；裁剪结果最长边不超过 1600px，输出临时 JPEG，目标约 1MB，以给 2MB Provider 请求上限
预留 base64 膨胀和文本上下文空间。图片只保存在 Background 当前函数/Provider 请求的内存引用中，
不进入 storage、Session、Panel 消息或日志。

### 3.6 Session 保存与恢复流程
```
首次提问 → 若无活动会话则新建(sessionId, pageUrl, pageType, repository)
  → 每轮追加 message → updatedAt 刷新
  → 活动 sessionId 写入 storage.session 指针
  → 页面变化(SPA) → 保持当前活动会话；只刷新 PageContext，不用 hydrate 覆盖对话
  → 用户选择最近会话 → 显式继续该会话；用户新建 → 强制创建独立会话
  → 对话超阈值 → 本地生成 historySummary，保留最近有限消息
  → 重开 Panel → 优先按活动指针恢复；无有效指针时按 pageUrl/repository 匹配
  → 30 天过期清理 / 容量超限淘汰(见 §8) / 用户手动删除
```

`sessions:v1` 由 Background 独占读写；Panel 只接收经 Schema 校验、总量限制为 48KB 的
`SESSION_STATE` 投影。Provider 请求只经 `ContextBuilder` 接收最近有限消息、历史摘要与必要偏好，
历史和偏好均不得进入固定 System Prompt（D-043）。

### 3.7 工具调用流程
```
模型输出 tool_call → ToolExecutor 查白名单
  → zod 校验参数 → 按 operationPolicy 分类:
      downloads/外链 → 弹 OperationConfirmation(逐次确认, 无"始终允许")
      accountChanges → 直接拒绝(deny)
  → 通过 → 分发到 Content(高亮/滚动/打开页面) 或 Background(搜索/API)
  → 返回 ToolResult → 回灌模型继续
```

**Phase 8 搜索实现（D-047）**：
```
中文搜索描述 → 本地确定性转换(target/query/explanation)
  → searchRepos/searchIssues 白名单 + zod
  → GitHubApiClient 固定匿名 /search/* 请求
  → 有限字段结果卡
  └─ search 桶受限 → 当前搜索页有限 DOM 结果 + https://github.com/search 降级入口
```
常见限定词由本地转换，当前不调用付费 Provider；严格只读转换 Prompt 仅作为可替换契约保留。
`github:rate-limits:v1` 持久化 `core/search/code_search` 三桶的 remaining/reset/blockedUntil，
同桶限流后到点前直接降级且不重试。API 与网页 URL 都由 Background 固定构造，Panel 不能要求
Background fetch 任意 URL；结果打开只接受 `https://github.com/*`。

**Phase 9 仓库分析实现（D-048）**：
```
当前公开 PageContext(DOM) + GitHub core API(详情/语言/Release/PR)
  → RepositoryAnalysisFacts（数字与可变状态的唯一事实源）
  → Provider 只生成定性 RepositoryInsights
      structuredOutput 可用 → json_object + zod
      不可用 → 严格 Prompt + zod，非法 JSON 最多重试一次
  → 本地事实回填覆盖 → 固定 RepositoryAnalysisCard → Panel
  └─ core/Provider/字段失败 → DOM/本地确定性卡片 + 明确 degradedNotice
```
README 中有界提取的安装命令优先于 Provider 建议；API 重定向以 `full_name/html_url`
规范化仓库身份。完整 core 聚合缓存 5 分钟，限流阻断状态继续由 D-032 三桶持久化。
Provider 输入仍是带不可信标记并经 sanitizer 处理的 user 数据，绝不进入 System 指令。

**Phase 11 第三轮补丁（D-054）**：README 在既有 3 文件取样配额内具有最高优先级；当
Contents API 与 DOM 都提供 README 片段时，优先采用路径和大小均经校验的 API 片段。固定卡片的
原 `quickScan` 先展示 README 概括、主要功能、配置/运行与简单实现线索；Provider 可生成简练中文解释，
但缺失/非法输出时由本地 Markdown 段落、功能章节、安装命令和文件摘要确定性降级。Star、语言、
Release、许可证等事实仍由 DOM/API 回填，并集中放入默认关闭的仓库事实区。

**Phase 11 第四轮补丁（D-055）**：3 文件配额内最多只取 1 份 README，顺序为根目录默认
README → 根目录中文 README → 根目录其他本地化 README → 嵌套说明，避免多语言文档挤出清单和入口。
README 提取会跳过 banner、badge、居中导航与 `�`，并从普通段落、功能章节或 HTML 功能表生成本地证据。
Provider 合法但字段不全的 JSON 先投影为已知 `RepositoryInsightPatch`，丢弃 Star 等未知事实字段，再与
本地完整 `RepositoryInsights` 合并；畸形 JSON/零已知字段仍最多重试一次。文件详情响应须再次通过路径
与 `(0, 24KB]` 大小校验，未增加请求次数、目录深度或文本预算。

**Phase 11 第五轮补丁（D-056）**：中文界面下的单份 README 选择顺序修订为根目录中文
README → 根目录默认 README → 根目录其他本地化 README → 嵌套说明。Provider 的自然语言字段须为
简体中文，英文结果最多按既有上限重试一次；展示层以中文 Provider 结果为先，再合并中文本地证据，
并让中文 README 用途优先于英文仓库 description。只有外文证据且 Provider 不可用时显示中文降级说明，
不直接把英文叙述作为中文速览。

**Phase 11 第六轮补丁（D-057）**：固定卡片不再混用 `quickScan`，而是拆为三个明确 seam：

```
受限 README / 关键文件
  ├─ Provider 理解并重组 → overview（新手总结，默认显示）
  │                     └─ details（较完整解释，默认折叠）
  └─ 本地确定性提取     → sourceSummary（原项目文件摘要，默认折叠）

DOM / GitHub API 可变事实 → facts 区（默认折叠）
```

`overview` 只包含 1–2 句自然中文和 2–3 个价值要点；不得放目录、脚本或依赖清单。Provider
不能写入 `sourceSummary`，因此模型重写不会覆盖原文件证据。技术字段仅允许纯命令、路径和标识符
保留原文，普通英文解释仍会被中文校验拒绝；总结、用途、功能、风险等同样须通过中文叙述校验。存在项目证据却缺少有效 `overview`
时，仅使用 D-048 既有的一次重试机会；不增加 Provider 调用上限。

**Phase 11 第七轮补丁（D-058）**：Provider 响应不再整份成败，而是逐字段校验并累积；第二次请求只补写
失败字段，因此 `overview` 修复不会丢失首轮已经合格的 `purpose` / `readmeSummary` / `features` /
`configuration`。`sourceSummary` 收敛为 README 路径与章节索引、配置证据和实现证据，Panel 不渲染
README 关键文件卡片的段落摘录。三文件选择在同一预算内优先覆盖 README、配置清单、实现/入口三类，
避免多个清单挤掉唯一源码样本；所有请求、目录、大小和文本上限保持不变。

### 3.8 确认流程（OperationConfirmation，v1.1 收紧 C-3）
需确认操作弹出：操作说明 + 影响 + 推荐选择 + **[允许本次] / [拒绝]** 两项。
**不提供"始终允许该类操作"**——高风险权限不能一次点击永久放开。`operationPolicy` 只在允许的枚举范围内配置（见 §5 UserPreferences）。

### 3.9 错误恢复流程
- 网络中断/超时：指数退避重试（上限 N 次），失败给中文可读错误 + 重试按钮；请求支持 Abort。
- Provider 报错（鉴权/额度/限流）：明确提示是哪家、什么错，建议手动切换 Provider。
- GitHub API 超限（v1.2 细化，D-032）：**按 resource 分桶节流**（`core` / `search` / `code_search` 各自独立配额）；读取 `X-RateLimit-Resource` / `X-RateLimit-Remaining` / `X-RateLimit-Reset` 与 `Retry-After` 头；**限流（403/429 且 Remaining=0）时不得持续指数重试**，等到 Reset/Retry-After 时间点后才恢复；`search` 受限时降级为打开 GitHub 网页搜索或本地 DOM 结果，`core` 受限时降级纯 DOM 并提示。
- Service Worker 被回收：状态在 storage，唤醒后由消息重建，不丢会话。

### 3.10 GitHub SPA 页面变化处理（v1.1，P1-4）
- **检测**：拦截 `history.pushState/replaceState` + `popstate` + Turbo 事件（GitHub 用 turbo 导航）+ `MutationObserver` 兜底。
- **去抖**：URL 变化后去抖（~300ms）再触发重新解析，避免连续导航重复解析。
- **重复初始化保护**：content script 入口幂等（挂载前检查全局标记），SPA 导航不重复注入叠层。
- **状态清理**：页面切换时清理旧选择状态（pick/框选叠层、已选元素）、使旧 PageContext 失效。
- **Session 关联**：页面切换只更新 PageContext，不自动替换 Panel 当前活动会话；用户可从最近会话列表显式切换或新建。Panel 完整重载时优先使用 `storage.session` 活动指针恢复，指针无效才按页面/仓库匹配。

---

## 4. 项目目录结构（v1.1：根目录即 `C:\AI_GitHelper-CN`，无嵌套项目根）

```
C:\AI_GitHelper-CN\              ← 唯一项目根 = Git 仓库根
├─ PROJECT_BASELINE.md 等 8 份规划文件（唯一权威版本, 不复制到别处）
├─ references/
│  └─ Claude_Prompt.md           # 原始需求 Prompt, 仅历史追溯
├─ .git/  .gitignore
├─ manifest.config.ts            # CRXJS manifest 定义
├─ vite.config.ts
├─ package.json / pnpm-lock.yaml
├─ tsconfig.json
├─ .nvmrc / .eslintrc / .prettierrc
├─ src/
│  ├─ background/
│  │  ├─ index.ts                # SW 入口: setAccessLevel + 注册 router
│  │  ├─ router.ts               # 来源校验 + Schema 校验
│  │  ├─ context-builder.ts
│  │  ├─ sanitizer.ts
│  │  ├─ provider-manager.ts     # Capability 路由 + Host 白名单
│  │  ├─ credential-store.ts     # 凭据访问接口(Options 只写删/BG 只读注入/Content 禁导入, D-028)
│  │  ├─ capture.ts              # captureVisibleTab + 裁剪
│  │  ├─ providers/
│  │  │  ├─ base.ts              # OpenAI 兼容基类 + Capabilities 声明
│  │  │  ├─ deepseek.ts / uuapi.ts / openrouter.ts
│  │  ├─ github-api.ts           # 匿名 + RateLimit 节流 + 缓存
│  │  ├─ tools/
│  │  │  ├─ registry.ts          # 白名单 + zod schema
│  │  │  └─ executors.ts
│  │  ├─ session-store.ts
│  │  └─ prefs-store.ts
│  ├─ content/
│  │  ├─ index.ts                # 幂等入口
│  │  ├─ detector.ts / spa-watcher.ts
│  │  ├─ parsers/ (repo/issue/pr/releases/blob/search/common)
│  │  ├─ selection/ (pick.ts / region.ts)   # region 上报坐标+dpr+滚动+缩放
│  │  └─ actions.ts              # 高亮/滚动(无截图)
│  ├─ panel/
│  │  ├─ index.html / main.tsx / App.tsx
│  │  ├─ components/
│  │  └─ store.ts                # Zustand(不含凭据)
│  ├─ options/
│  │  ├─ index.html / main.tsx
│  │  └─ components/             # 含数据流向披露组件
│  ├─ lib/
│  │  ├─ storage.ts / messaging.ts / logger.ts / types.ts
│  │  └─ github/ (page-type, url-parse)
│  └─ locales/zh-CN.ts
├─ tests/
│  ├─ unit/ (parsers, sanitizer, provider, tools, credential)
│  ├─ fixtures/ (GitHub 页面 HTML 快照)
│  └─ e2e/ (Playwright)
├─ scripts/                      # 构建/辅助脚本
├─ dist/                         # 构建产物(gitignore)
└─ docs/                         # (可选)仅面向使用者的派生文档, 不放规划文件副本
```

**C-1 约束**：8 份规划文件只在根目录保留唯一权威版本；`docs/` 若存在，只放派生使用文档，不得复制规划文件。

---

## 5. 数据模型（TypeScript，权威定义，v1.1 修订）

```ts
// 临时页面上下文（不落库）
interface PageContext {
  url: string;
  pageType: 'repo'|'issue'|'pr'|'releases'|'blob'|'search'|'code'|'other';
  repository?: string;           // "owner/repo"
  isPrivate: boolean;            // true → 零出站阻断(SECURITY §4)
  issueOrPrNumber?: number;
  extracted: Record<string, unknown>;
  pageSummary?: string;
  capturedAt: string;
}

interface SelectedElement {
  tag: string; role?: string; text: string;
  href?: string; sourceUrl?: string;
  attrs: Record<string,string>;
  nearbyContext: string; pageType: PageContext['pageType'];
}

interface SelectedRegion {
  text: string; links: string[]; codeBlocks: string[];
  buttons: string[]; htmlOutline: string; nearbyContext: string;
  needsVision: boolean;
  sourceUrl?: string;                    // 截图前活动页二次校验
  // 截图所需坐标信息(Content 上报, SW 裁剪用; 换算方法以 Phase 0 探针 B 结论为准, D-029):
  rect: { x:number; y:number; width:number; height:number };  // 视口坐标(getBoundingClientRect 语义)
  viewport: { cssWidth:number; cssHeight:number };            // 视口 CSS 尺寸(用于 scaleX/scaleY)
  scroll: { x:number; y:number };                             // 仅供探针 B 结论需要时使用
  devicePixelRatio: number;
  zoomFactor?: number;
}

interface Message {
  id: string; role: 'user'|'assistant'|'tool'|'system';
  content: string; toolCall?: ToolCall; toolResult?: ToolResult;
  createdAt: string;
}

interface Session {
  schemaVersion: number;
  sessionId: string; pageUrl: string; pageType: string;
  repository?: string; messages: Message[];
  pageSummary?: string; historySummary?: string;
  updatedAt: string; createdAt: string;
}

interface UserPreferences {
  schemaVersion: number;
  language: 'zh-CN';
  technicalLevel: 'beginner'|'intermediate'|'advanced';
  operatingSystem: string;
  explanationPreference: string;
  operationPolicy: {              // v1.1 收紧(C-3)
    navigation: 'auto'|'confirm';
    search: 'auto'|'confirm';
    downloads: 'confirm'|'deny';  // 无 'auto'
    accountChanges: 'deny';       // 固定 deny, v1 不实现账号写入
  };
  visionEnabled: boolean;         // 默认 true
  // v1.1: 移除 allowPrivateRepos(v1 完全不支持私有仓库)
}

// v1.1: 凭据与配置分离(P0-1)
interface ProviderCredential {    // 仅 credential-store 可读写
  providerId: 'deepseek'|'uuapi'|'openrouter';
  apiKey: string;
}

interface ProviderConfig {        // 不含 Key
  id: 'deepseek'|'uuapi'|'openrouter';
  label: string;
  apiHost: string;               // 固定预设(P0-3), 用户不可改:
                                 // deepseek: https://api.deepseek.com
                                 // uuapi:    https://uuapi.net
                                 // openrouter: https://openrouter.ai
  textModel: string;             // 可配置，不硬编码
  visionModel?: string;
  capabilities: ProviderCapabilities;
  keyMasked?: string;            // 仅显示用(尾4位), Background 计算下发
}

// v1.1: Provider 能力模型(P0-6)
interface ProviderCapabilities {
  supportsStreaming: boolean;
  supportsVision: boolean;
  supportsToolCalls: boolean;
  supportsStructuredOutput: boolean;
  supportsUsage: boolean;
  supportsAbort: boolean;
  imageInputFormat: 'openai_image_url' | 'none';
  toolCallStreamingFormat: 'openai_delta' | 'none';
  errorResponseFormat: 'openai' | 'custom';
  probedAt?: string;             // 能力探针最近验证时间; 未探针的能力不得当既定事实
}

interface ProviderRouting {
  textProviderId: ProviderConfig['id'];    // 默认 'deepseek'
  visionProviderId: ProviderConfig['id'];  // 默认 'uuapi'
  fallbackProviderId: ProviderConfig['id'];// 默认 'openrouter'
  manualOverrideId?: ProviderConfig['id']; // Side Panel 手动选择，优先级最高
}

interface AIRequest {
  providerId: string; model: string;
  messages: Message[]; needsVision: boolean;
  images?: string[];
  timeoutMs: number; maxPayloadBytes: number; // P0-5 地基
}
interface AIResponse {
  content: string; toolCalls?: ToolCall[];
  usage?: { promptTokens:number; completionTokens:number };
  providerId: string; model: string;
}

interface ToolCall { name: string; args: Record<string,unknown>; }
interface ToolResult { name: string; ok: boolean; data?: unknown; error?: string; }

interface OperationConfirmation {
  action: string; description: string; impact: string;
  recommended: 'allow'|'deny';
  category: 'download'|'external';  // v1.1: 'account' 类直接 deny, 不进确认流
  // v1.1: 无 alwaysAllow 字段(C-3)
}

// v1.1: 移除 GitHubTokenConfig(P0-7, v1 无 Token)
```

---

## 6. Chrome 权限设计（最小化，v1.1 复审）

| 权限 | 是否 v1 必需 | 为什么 | 更小方案 / 复审结论（Phase 0 探针最终确认） |
|---|---|---|---|
| `sidePanel` | 是 | 主界面 | 无替代 |
| `storage` | 是 | 会话/偏好/凭据 | 初始化即 `setAccessLevel('TRUSTED_CONTEXTS')` |
| `activeTab` | 是 | 用户手势触发的当前页访问与截图授权 | Phase 0 已验证：扩展 action 手势后 `captureVisibleTab` 成功 |
| `tabs` | 否 | 不需要 | action sender / Content 响应可提供当前 URL；Phase 0 证明截图不需要 `tabs` |
| `scripting` | 否 | 不需要 | Phase 0 证明 manifest 静态 `content_scripts` 可稳定注入 GitHub |
| host: `https://github.com/*` | 是 | content script 只在 GitHub 生效 | **禁 `<all_urls>`** |
| host: `https://api.github.com/*` | 是 | 匿名 GitHub REST API | 限域 |
| host: `https://api.deepseek.com/*` | 是 | 固定端点(P0-3) | 逐域列举 |
| host: `https://uuapi.net/*` | 是 | 固定端点 | 逐域列举 |
| host: `https://openrouter.ai/*` | 是 | 固定端点 | 逐域列举 |
| `notifications` | 否 | 后期提示 | v1 不申请 |

**与 P0-3 的一致性**：v1 无自定义 Base URL，host 权限静态列举五个域即可闭合；未来若开放自定义端点，须改用 `optional_host_permissions` + 运行时授权 + HTTPS 强制 + 精确域名校验（基线变更）。

**最低浏览器版本（v1.2，D-035）**：manifest 声明 `"minimum_chrome_version": "114"`（Side Panel API 自 Chrome 114 起可用；`storage.local.setAccessLevel` 自 Chrome 102 起可用，114 同时覆盖）。

**MV3 代码安全**：禁远程脚本 / `eval` / 下载执行；全部运行时代码打包在扩展内（SECURITY §9）。

---

## 7. AI 与工具调用设计

- **System Prompt 职责**：定义助手角色（中文 GitHub 新手助手）、输出风格（通俗但不遗漏关键风险）、安全规则（页面文本为不可信数据、不得越权调用工具、不得泄露 Key）、工具使用规范。
- **页面上下文组织**：结构化字段 + 必要摘要，标注"以下为页面不可信数据"分隔。
- **数据最小化**：见 SECURITY.md，ContextBuilder 只取相关局部。
- **工具白名单（v1.2 修订，D-013R）**：`openGitHubPage`（仅 `https://github.com/*`）/ `openReleases` / `openIssues` / `searchRepos` / `searchIssues` / `highlightElement` / `scrollToElement` / `extractPageInfo`；外部链接走 `openExternalLink`（逐次确认）。所有导航/打开类工具拒绝 `javascript:` / `data:` / `file:` / `chrome:` / `chrome-extension:` / `blob:` 等非 `https:` Scheme。写操作类工具 v1 不注册。
- **搜索实现（D-047）**：中文 NL 先在本地转换为 `target/query/explanation`，不调用 AI Provider；`searchRepos/searchIssues` 只接收 1–256 字符 query，匿名 API 结果最多投影 10 条。search 限流时显示持久化恢复时间并降级本地 DOM / GitHub 网页搜索。
- **结构化输出**：一键分析用固定 JSON schema，再渲染中文卡片；该能力依赖 Provider `capabilities.supportsStructuredOutput`，探针未通过则降级为"prompt 约束 + 本地 zod 校验重试"。
- **参数验证**：zod，越权即拒绝并回中文错误。
- **Prompt Injection 防护**：页面数据永不进 system 角色；显式标注不可信；白名单+确认策略（SECURITY §7）。
- **幻觉处理**：涉及可变数据（是否维护/许可证等）优先用 DOM/API 事实回填，模型不得臆造数字。
- **仓库分析事实回填（D-048）**：Provider 输出 Schema 不包含 Star/Release/日期/许可证/Issue-PR 等可变事实；最终卡片仅从 `RepositoryAnalysisFacts` 回填这些字段。Provider 失败不阻断事实卡，降级说明明确标记数据源。
- **Phase 10 安全执行 seam（D-049）**：`sanitizer` 统一字符串与结构化敏感字段遮蔽，Message Router 复用同一字段判定；`ToolRegistry` 统一全部只读工具的白名单、strict zod 参数与逐次确认，搜索执行器只取得搜索子集。PanelBridge 在会话准备、Provider、GitHub API 与截图前先执行私有页阻断。
- **对话持久化脱敏（D-051）**：PanelBridge 对已校验的问题先脱敏，再把同一结果交给 SessionStore 与 Provider runtime；因此 ContextBuilder 不是问题明文离开临时输入状态前的唯一防线。
- **问答状态与紧凑交互（D-052）**：页面上下文与活动会话是两个独立状态；`hydrate` 只补充最近会话目录，不能覆盖 Panel 当前对话。Panel 提供显式会话选择/新建、分析与问答折叠、点击/框选后的输入 CTA；System Prompt 约束普通回答简练但不牺牲准确性。
- **受限文件证据（D-053）**：仓库分析由 Background 固定构造 GitHub Contents API 路径，只读取根目录、最多 2 个高信号源码目录与最多 3 个关键文件；单候选文件 API 大小 ≤24KB，解码文本 ≤4KB，锁文件和不安全路径拒绝。确定性层先提取目录、文件角色、清单脚本/依赖或源码定义，再把经 sanitizer 的不可信片段交给 Provider；卡片不保存或返回原始文件正文。
- **逐轮与会话删除（D-053）**：Panel 只提交 `sessionId + userMessageId` 或 `sessionId`，Background 在 SessionStore 内确定删除边界并回推完整有界快照。问答轮次删除范围为目标 user 消息到下一条 user 消息之前；整会话删除若命中活动指针则同步清除。两种删除都只在 Panel 展开 `✓/×` 后由 `✓` 触发。

---

## 8. 存储容量与淘汰策略（v1.1，P1-1）

**存储分区**：
- `chrome.storage.session`：即时页面状态（当前 PageContext 缓存、pick/框选临时态、版本化活动会话 ID 指针；不含消息正文）。
- `chrome.storage.local`（TRUSTED_CONTEXTS）：偏好、Provider 非敏感配置、会话索引、摘要、凭据（独立 key 前缀，经 credential-store 访问）。
- IndexedDB：**启用条件** = 单会话消息体或总量逼近 storage.local 配额（见硬上限）时启用，存长会话正文；v1 先不启用，封装层预留。
- 截图：**只在内存/请求生命周期内使用，不持久保存**。

**限额（v1 初始值，可在 DECISIONS 调整）**：
| 项 | 值 |
|---|---|
| 单会话最大消息数 | 200 条（超出触发摘要压缩） |
| 单条消息最大长度 | 16 KB（超长截断+提示） |
| 页面上下文最大长度 | 32 KB |
| 对话摘要触发 | 消息数 > 40 或估算 token > 8k |
| 最近会话保留数量 | 50 个 |
| 保留期 | 30 天 |
| 总存储软上限 | 6 MB（达到→提示+优先淘汰） |
| 总存储硬上限 | 9 MB（storage.local 配额 10MB 的 90%；达到→强制淘汰） |

**淘汰顺序**（超限时从先到后）：过期会话（>30 天）→ 最旧的超量会话（>50 个）→ 已摘要会话的原始消息正文（保留摘要）→ 页面摘要缓存。用户偏好与凭据**永不自动淘汰**。

**容量检查**：`lib/storage` 封装 `chrome.storage.local.getBytesInUse()`，写入前检查，Options 页显示当前用量 + 手动清除入口。

**数据清除（v1.2，D-033）**：Options 页提供三个独立入口——① 清除会话/偏好（不动凭据）；② 删除单个 Provider Key（经 credential-store）；③ 明确二次确认后清除全部本地数据（会话+偏好+全部凭据）。每种清除配套"目标无残留、非目标完好"断言测试。

**Phase 5 实现定稿（D-043/D-044）**：会话集合使用版本化 `sessions:v1` 记录；偏好使用
`preferences:v1` 且读写均经 zod 校验。超过摘要阈值时使用本地提取式摘要，不额外调用付费 Provider；
总上下文仍受 32KB 上限约束。清除全部数据后同步重置 Background 内存中的 Provider 探针/禁用状态，
避免持久数据已空但旧能力状态继续生效。

**Phase 11 人工复核补丁（D-052）**：活动会话指针使用 `panel:active-session:v1`，只保存
`schemaVersion` 与 `sessionId`；最近会话目录投影最多 10 项且只含 ID、短标题、短仓库标识、更新时间与消息数，
不含页面 URL 或消息正文。
会话/偏好清除和全部数据清除都会同步移除活动指针。

**Phase 11 第二轮补丁（D-053）**：`PANEL_TURN_DELETE` 与 `PANEL_SESSION_DELETE` 均经来源校验、
strict zod payload 与 64KB 信封限制；UI 的垃圾桶只进入待确认态，`✓` 才删除，`×` 不改变数据。
删除活动会话后 Panel 收到 `cause: new`，删除非活动会话后当前上下文保持不变。

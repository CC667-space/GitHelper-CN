# STATUS.md — 当前进度与状态

> 执行 Agent 每完成一个任务/阶段必须更新本文件。这是断点续跑的依据。

---

## 当前阶段
**Phase 11 — 测试、打包与 MVP 验收：前六轮人工复核问题均已修复并通过自动验收，等待 S1–S5 复核。**

## 已完成
- [x] 需求确认（用户已回复"全部采用推荐默认值"，Q7 提供 DeepSeek/UUAPI/OpenRouter Key；补充要求 Provider 可手动切换）
- [x] 联网核实：DeepSeek API 目前不支持图像输入、`deepseek-chat`/`deepseek-reasoner` 别名 2026-07-24 15:59 UTC 起停用（推荐改用 `deepseek-v4-flash`，D-034）；UUAPI 为 OpenAI 兼容中转（uuapi.net/v1）；`chrome.storage.local.setAccessLevel('TRUSTED_CONTEXTS')` 为 Chrome 官方 API
- [x] 冻结基线 `PROJECT_BASELINE.md`（v1.0，2026-07-23）
- [x] 全部 8 份规划文件初版（2026-07-23）
- [x] **v1.1 定向修订（2026-07-24，依据《修订任务单》P0-1~8 / C-1~3 / P1-1~4）**：
  - PROJECT_BASELINE.md：唯一根目录冻结、数据流向准确表述、私有仓库/Token 移除、操作策略收紧
  - SECURITY.md：凭据 TRUSTED_CONTEXTS 隔离、Host 白名单、消息协议安全、注入防护客观表述
  - ARCHITECTURE.md：截图职责划分（SW 截图）、Capability 模型、存储分区与淘汰、SPA 处理、权限复审表
  - DECISIONS.md：D-009/D-010 v1.1 修订 + 新增 D-020~D-027
  - EXECUTION_PLAN.md：新增 Phase 1.5 安全地基、Phase 0 探针 A-D、Git 治理、C-2 核心功能约束
  - ACCEPTANCE.md：Phase 0/1.5 验收、安全客观机制项 + 红队评估项分离、新阶段速查表
  - AGENTS.md：Git 治理、每轮前后检查、权威裁决顺序、技术备忘更新
  - `Claude_Prompt.md` 移至 `references/`（仅历史追溯，非权威）
- [x] **v1.2 最终定点修订（2026-07-24，9 项）**：
  - 凭据录入/保存路径与 import 边界（D-028），修正 ACCEPTANCE 不可实现的"明文不出现于 DOM/状态"
  - 删除写死的截图坐标换算公式，改由 Phase 0 探针 B 实测定稿（D-029，首选截图像素/视口 CSS 比例法）
  - D-007 修订为公共协议骨架 + 独立适配器 + 能力探针（D-030）
  - Phase 4 可用性判定：三适配器+Mock 必做；真实端点 ≥1 文本 + ≥1 视觉即达标，单家失败不阻塞（D-031）
  - GitHub 限流按 core/search/code_search 分桶 + Retry-After + 禁指数重试 + search 降级（D-032）
  - openPage 拆分 openGitHubPage/openExternalLink + 非 https Scheme 黑名单（D-013R）
  - 数据清除三分：会话偏好 / 单 Key / 全部（D-033）
  - manifest 增加 `minimum_chrome_version: "114"`（D-035）
  - DeepSeek 模型策略：别名 2026-07-24 15:59 UTC 停用，推荐 `deepseek-v4-flash`，保留 `deepseek-v4-pro`，模型名非冻结常量（D-034）
- [x] **Phase 0 — 基线检查、环境与技术探针（2026-07-24）**：
  - 只读基线检查通过：唯一根目录正确，8 份规划文件各一份，`references/Claude_Prompt.md` 就位
  - 修正“下一任务”中的 `EXECUTION_PLAN v1.1` → `v1.2`，纳入初始基线提交 `96120a6`
  - 建立 pnpm 11 + Node 24 LTS 锁 + TypeScript strict + ESLint + Prettier + Vite 8 + CRXJS 2.7.1 最小 MV3 扩展
  - manifest 已含 `minimum_chrome_version: "114"`、五域 Host 白名单与最终最小权限
  - 探针 A–D 全部通过：Side Panel、静态 Content 注入/URL、截图比例换算、权限复审、TRUSTED_CONTEXTS 隔离
  - 截图公式定稿并回写 ARCHITECTURE §3.5；权限定稿为 `sidePanel/storage/activeTab`，不申请 `tabs/scripting/<all_urls>`
  - Node 24.18.0 验证：typecheck 通过、lint 通过、Vitest 1/1 通过、build 通过
  - 完整证据：`scripts/probe-results.md`
- [x] **Phase 1 — 仓库结构与扩展骨架（2026-07-24）**：
  - 按 ARCHITECTURE §4 补齐 Background / Content / Panel / Options / shared lib / tests 目录骨架
  - `lib/types.ts` 落地 PageContext、SelectedElement/Region、Session、ProviderCredential、ProviderCapabilities、ProviderRouting、AIRequest/Response 等权威模型；不含 GitHub Token / 私有仓库开关
  - `lib/storage`：schemaVersion、逐版本迁移、getBytesInUse、软/硬容量检查与类型化硬上限错误
  - `lib/messaging`：v1 信封、请求 ID、固定 type、zod payload 校验、64KB 限制、类型化超时
  - `lib/logger`：字段/模式双层脱敏、循环引用保护、超长截断、生产日志级别
  - 验收：typecheck 通过、lint 通过、Vitest 4 files / 10 tests 全过、build 通过；权限仍为 Phase 0 定稿清单
- [x] **Phase 1.5 — 安全地基（2026-07-24）**：
  - `credential-store` 按 Options write/delete、Background read/inject 分离，并以 ESLint 边界禁止 Content 导入、禁止 Options 读取、禁止其他 Background 模块写入
  - Provider 出站请求只接受五个冻结 Host，具备请求体上限、`AbortController` 超时与外部取消；私有/无权限上下文在出站入口前硬拒绝
  - 消息路由校验扩展 sender、GitHub 顶层 Content 来源、固定 envelope、zod payload、64KB 上限、超时及凭据字段
  - sanitizer 覆盖 API Key、GitHub Token、私钥、环境变量、Cookie、密码、邮箱、手机号；System Prompt 与不可信页面数据以固定边界隔离
  - 构建产物扫描拒绝 `eval`、`new Function`、远程动态 import/script 与不安全 CSP
  - 验收：typecheck、lint 通过；Vitest 11 files / 25 tests 全过；build 与构建安全扫描通过
- [x] **Phase 2 — Side Panel 与消息通信（2026-07-24）**：
  - React + Tailwind + Zustand Panel 已含 Provider 占位、会话区、输入区、连接状态与页面标签
  - Panel ↔ Background 使用命名长连接与安全 envelope；Background ↔ Content 使用 request ID 绑定的请求/响应
  - 流式占位按 `start/context/delta/done/error` 回推；Content 返回当前 URL、标题与采集时间占位
  - Options 落地数据流向披露骨架，明确最小上下文与私有仓库禁止出站
  - 集成测试覆盖完整 Panel → Background → Content → Panel 往返、伪造来源及非法 Schema
  - 验收：typecheck、lint 通过；Vitest 13 files / 29 tests 全过；build 与构建安全扫描通过；隔离 Chrome 实测扩展加载、Side Panel 打开及 Content 注入均通过
- [x] **Phase 3 — GitHub 页面识别与上下文读取（2026-07-24）**：
  - URL + 稳定 DOM 特征识别 repo/issue/pr/releases/blob/search/code/other，并按页面类型独立解析 PageContext
  - 解析器提取标题、描述、状态、正文、标签、分支、发布、文件代码、搜索结果等有限字段；未知/残缺 DOM 降级有限纯文本且不抛异常
  - 私有仓库、Repository not found 与登录受限页面统一标记为零出站上下文，并与出站阻断函数联测
  - SPA watcher 覆盖 pushState/replaceState/popstate/turbo/MutationObserver，300ms 去抖；URL 变化立即失效旧上下文、清理选择态；Content 入口幂等
  - 8 个 GitHub 精简 HTML fixture 覆盖六种公开页面及私有/无权限边界
  - 验收：typecheck、lint 通过；Vitest 16 files / 42 tests 全过；build 与构建安全扫描通过；隔离 Chrome 实测 Content 注入、Side Panel 与探针均通过
- [x] **Phase 4 — 不需要真实凭据的全部工作（2026-07-24）**：
  - 公共 Provider 协议与 DeepSeek / UUAPI / OpenRouter 三个独立适配器完成；固定 endpoint、model 映射、非流式/SSE、usage、工具调用、错误/限流映射和 request ID 取消均有 Mock
  - DeepSeek 拒绝停用别名与图像输入；UUAPI/OpenRouter 支持 OpenAI image_url 组装但在真实探针前不声明视觉可用
  - Provider Manager 完成文本/视觉默认路由、手动覆盖优先、未探针阻断、视觉 Capability 护栏和单 Provider 失败禁用
  - 能力探针框架覆盖模型列表、文本、流式、取消、视觉、工具、结构化输出、usage、错误格式；真实限流只在实际遇到时标记，不主动制造限流
  - Panel 已接真实流式 runtime、文本/视觉 Provider 分列、不可用项置灰、停止生成；Options 已接 Key password input、保存即清空、Background 掩码回读、model 配置与完整数据流向披露
  - UUAPI model 留空时真实探针先尝试 `/v1/models` 自动选择；用户也可在同一 Options 页面覆盖 model ID
  - 初始真实能力记录为“未探针”，真实结果与后续更新位置：`scripts/provider-probe-report.md`
  - 无凭据验收：Node 24.18.0 下 typecheck、lint 通过；Vitest 20 files / 58 tests 全过；build 与构建安全扫描通过；隔离 Chrome 实测 SW/Options/Panel/Content 加载、TRUSTED_CONTEXTS 与权限探针均通过
- [x] 用户确认已在扩展 Options 页填入真实 Provider Key；未在聊天、代码、日志、配置或 Git 中接收/记录明文
- [x] 将 Options 真实探针消息超时从通用 15 秒单独放宽到 10 分钟；typecheck、lint、Vitest 20 files / 58 tests、build 与构建安全扫描通过
- [x] 修复真实探针按钮“点击后看似无反应”：运行/完成/失败状态改为在按钮卡片内原位显示，运行中禁用重复点击；新增回归测试后 Vitest 20 files / 59 tests 全过
- [x] 修复真实探针完成后把约 107KB 完整报告塞入 64KB 消息导致 UI 报错：完整报告不再跨消息返回，仅回传紧凑 Provider 状态；Provider 卡片新增文本/视觉验证结果与失败原因；新增路由/UI 回归测试后 Vitest 21 files / 61 tests 全过
- [x] 首轮真实结果：OpenRouter 文本已验证；DeepSeek 文本探针失败；UUAPI HTTP 502；OpenRouter 与 UUAPI 视觉均未通过，触发 D-031 条件性暂停
- [x] 修复视觉探针假阴性风险：样例由 1×1 改为 32×32 PNG；配置型号在 `/models` 中明确不支持 `image` 时自动选择图像输入型号，通过后保存实际型号；UI 持久化并显示视觉失败原因；最终 typecheck、lint、Vitest 21 files / 62 tests、build 与构建安全扫描通过
- [x] 第二轮真实结果：OpenRouter 文本继续通过，但 `~openai/gpt-latest` 视觉返回空内容；UUAPI 返回 `All available accounts exhausted`；DeepSeek 文本仍失败
- [x] 为 OpenRouter 增加明确视觉 fallback：首选视觉模型报错或返回空内容时改用官方 `openrouter/free` 路由，通过后保存实际视觉模型；typecheck、lint、Vitest 21 files / 63 tests、build 与构建安全扫描通过
- [x] 第三轮真实结果：UUAPI/OpenRouter 文本已验证，OpenRouter 视觉已验证；D-031“至少一个文本 + 一个视觉 Provider”硬门槛通过；DeepSeek 单家失败记录并禁用
- [x] 新增 D-038，记录 OpenRouter 视觉 fallback、32×32 样例图及第三轮真实证据
- [x] 定位 DeepSeek 空正文高置信根因：V4 默认启用 Thinking，而 16-token 探针预算同时覆盖 reasoning 与最终正文；适配器现显式发送 `thinking.type=disabled`，符合低成本默认文本路线
- [x] Options 增加“仅复测单个 Provider”，消息 Schema、Router 与 Runtime 只调用明确目标并保留其他 Provider 已有结果；21 files / 66 tests、typecheck、lint、build 与构建安全扫描通过
- [x] 新增 D-039，记录 DeepSeek V4 非思考默认、未来 Thinking 边界及单 Provider 复测策略
- [x] 第四轮仅复测 DeepSeek：文本已验证；真实端点证实 D-039 修复有效，低成本默认文本路线恢复可用
- [x] 修复 Side Panel 三项真实交互缺陷（D-040）：扩展 action/快捷键直接打开 Panel；忽略 React StrictMode 旧连接的延迟断开；Enter 发送、Shift+Enter 换行并避开 IME 合成
- [x] 三项缺陷均先由独立红测稳定复现再修复；最终 typecheck、lint、Vitest 22 files / 69 tests、build 与构建安全扫描通过
- [x] 真实 UI 复验：action 直接打开、连接状态、发送键、Enter/Shift+Enter 与 DeepSeek 首轮流式回答全部成功
- [x] 首轮回答后发现 Background port 断开会永久离线；新增 D-041 自动重连（250ms 起步、最高 5s，主动关闭不重连），生命周期红测转绿
- [x] D-041 补丁最终通过 typecheck、lint、Vitest 23 files / 70 tests、build 与构建安全扫描
- [x] 真实连续两轮 DeepSeek 对话成功；D-041 自动重连与第二轮发送通过用户实测
- [x] 新增 D-042 安全 Markdown/GFM 渲染：标题、列表、强调、引用、代码与表格语义化展示；原始 HTML、远程图片、可点击外链均阻断
- [x] Markdown 红测转绿；固定 `react-markdown@10.1.0` / `remark-gfm@4.0.1`，依赖锁通过供应链策略；最终 typecheck、lint、Vitest 23 files / 71 tests、build 与构建安全扫描通过
- [x] **Phase 4 — Provider + 能力探针 + 对话 + 手动切换（2026-07-24）通过验收**：三适配器 Mock、真实文本/视觉探针、DeepSeek 低成本路线、手动切换、连续两轮流式对话、断线恢复、输入交互与安全 Markdown 展示均完成
- [x] **Phase 5 — Session + 偏好 + 容量淘汰（2026-07-24）通过验收**：
  - Background `SessionStore` 完成新建、同页面/同仓库继续、最近列表、删除、页面关联、30 天过期与最近 50 个限制；Panel 连接/重连后按当前页面恢复最近会话
  - 单条消息限制 16KB；消息数 >40 或估算 token >8k 时生成本地提取式 `historySummary`；Provider 只接收 ContextBuilder 统一组装的有限历史和必要偏好，Panel 恢复载荷限制为 48KB
  - 容量写入使用 `getBytesInUse()`；按过期 → 超量 → 已摘要正文 → 页面摘要顺序淘汰，偏好和凭据不自动淘汰；Options 展示当前用量与 6MB/9MB 阈值
  - `PreferencesStore` 用 zod 同时约束类型与运行时数据；`downloads` 仅 confirm/deny，`accountChanges` 固定 deny
  - D-033 三种入口完成：会话/偏好清除不动 Key、单 Key 删除、明确二次确认后清除全部本地数据；全清同时清空 Background 内存探针状态，避免重录 Key 后误用旧能力结论
  - 验收：Node 24.18.0 下 typecheck、lint 通过；Vitest 27 files / 87 tests 全过；build（393 modules）与构建安全扫描通过
- [x] **Phase 6 — 点击元素提问（MVP 必达，2026-07-24）通过验收**：
  - Panel 增加“点击页面元素提问”入口、选择中取消、已选元素预览/重选/清除；选择中禁用普通发送
  - Content `PickController` 用捕获阶段处理 pointermove/click/Escape；悬停叠层不接管 pointer events，选中时阻止原页面点击，退出、取消与 SPA 失效均移除监听和叠层
  - `SelectedElement` 提取 tag/role/text/href/sourceUrl/安全属性/邻近上下文/pageType；嵌套点击归一到链接/按钮等逻辑元素，password input 不提取 value
  - Panel → Background → Content 及返回状态全部使用固定 envelope + request ID + zod；所选元素只由 ContextBuilder 作为不可信页面数据加入 user 上下文
  - 发送前以 `sourceUrl` 对比当前页面；SPA 后旧选择被丢弃并提示，不会发给 Provider
  - 验收：typecheck、lint 通过；Vitest 29 files / 95 tests 全过；build（394 modules）与构建安全扫描通过
- [x] **Phase 7 — 框选区域与视觉输入（MVP 必达，2026-07-24）通过验收**：
  - Content `RegionController` 完成 pointer drag 画框、反向拖动坐标归一、Escape/取消/SPA 清理，并上报 rect/viewport/scroll/dpr/zoom/sourceUrl
  - 区域内文字、链接、代码、按钮、HTML outline 与邻近上下文有界提取；本地统一充分性规则决定 `needsVision`，zod 拒绝字段与内容不一致
  - 结构充分时只走文本 Provider 且截图调用为 0；结构不足时 Panel 明确提示视觉 Provider 与可能费用，发送动作后才截图
  - Background 使用 Phase 0 比例法 `captured / viewport CSS` 换算并 clamp，绝不扣 scroll；裁剪缩放为最长边 ≤1600 的临时 JPEG，约 1MB 上限，只在请求生命周期内存在
  - `visionEnabled=false` 在会话写入、截图和 Provider 前阻断；视觉 Provider 继续受已探针 Capability 护栏；活动页/sourceUrl 二次校验防止截错页
  - 验收：typecheck、lint 通过；Vitest 32 files / 107 tests 全过；build（397 modules）与构建安全扫描通过
- [x] **Phase 8 — 自然语言 GitHub 搜索（MVP 必达，2026-07-24）通过验收**：
  - Panel 增加独立中文搜索区，可自动判断仓库/Issue 或手动指定类型；本地确定性转换覆盖 language/stars/topic/repo/is/label/pushed/archived 等限定词，搜索不额外调用 AI Provider
  - `searchRepos` / `searchIssues` 进入只读工具白名单并经严格 zod 参数校验；Background 只访问固定 `api.github.com/search/*`，匿名结果投影为最多 10 条有限字段
  - `core/search/code_search` 限流状态按 `X-RateLimit-Resource` 独立持久化，解析 Remaining/Reset/Retry-After；限流期间同桶直接降级、零重试，到点后恢复
  - search 桶受限时显示可读恢复时间、本地 GitHub 搜索页 DOM 结果（若有）与安全 `https://github.com/search` 入口；结果和降级 URL 经共享 Schema 限定为 GitHub HTTPS
  - Panel 展示简短查询解释、实际 GitHub 语法、总数和仓库/Issue 结果卡；打开结果统一走安全消息路由
  - 验收：typecheck、lint 通过；Vitest 37 files / 126 tests 全过；build（402 modules）与构建安全扫描通过
- [x] **Phase 9 — 一键仓库分析（2026-07-24）通过验收**：
  - 固定 `RepositoryAnalysisCard` Schema 覆盖用途、语言、平台、安装、Release、更新、Star/Fork/Watch、归档、许可证、Issue/PR、难度、风险与下一步；每项都有长度/条数边界
  - 匿名 core API 聚合仓库详情、语言、最新 Release 与开放 PR；结合 `open_issues_count` 回填 Issue/PR 分项，缓存 5 分钟，部分失败保留已有事实
  - 可变数字、日期、许可证与归档状态只由 DOM/API 事实层写入；Provider 仅生成用途/平台/难度/风险/下一步，不能覆盖事实字段
  - structuredOutput 已验证时请求 `json_object`；未验证时使用严格 Prompt + 本地 zod，非法 JSON 仅重试一次；网络/Provider 错误不重复调用并降级本地确定性说明
  - README 安装命令优先于 Provider 建议；缺 Release/许可证/语言时固定卡片保留并显示未知/风险；core 限流直接走 DOM，不重复 API 请求
  - GitHub 重定向以 API `full_name/html_url` 回填 canonical 仓库；历史名 `facebook/react` → `react/react` 已有回归
  - 真实匿名验收：`react/react`、`microsoft/vscode`、`rust-lang/rust` 三库全部生成卡片，未命中 core 限流；证据见 `scripts/phase9-live-evidence.md`
  - 常规验收：typecheck、lint 通过；Vitest 40 files / 143 tests 全过（另 1 个 live test 默认跳过、单独真实运行通过）；build（404 modules）与构建安全扫描通过
- [x] **Phase 10 — 安全加固与红队测试（2026-07-24）通过验收**：
  - sanitizer 新增云密钥、Authorization/Basic、JWT、URL 凭据、JSON 命名字段与结构化敏感键名遮蔽；循环对象安全终止；消息 Router 复用同一敏感字段策略并在 handler 前递归拒绝
  - 完整只读 `ToolRegistry` 覆盖冻结工具清单与 strict zod Schema；GitHub 导航拒绝非 HTTPS、非精确 GitHub Host、userinfo 和多余参数，外链拒绝 URL 凭据且必须逐次确认；无写入/账号/下载工具
  - 私有/无权限 PageContext 在 Panel 对话、搜索、仓库分析入口统一阻断，Provider、GitHub API、会话准备与截图均有零调用断言
  - D-033 三种清除均有“目标无残留、非目标完好”证据；manifest 最小权限、五域、CSP、凭据导入边界与构建安全重新复核
  - 出站泄漏测试覆盖 ContextBuilder 到实际 DeepSeek 请求体；日志覆盖字符串/Error/对象/数组，测试哨兵明文均未出现
  - 12 个 Prompt Injection 样例覆盖 README/Issue/PR/代码/Release/选择/搜索等载体；全部按最坏恶意工具输出被 System 隔离、白名单、Schema、Scheme/Host 或确认层拦截，记录见 `tests/security/redteam-log.md`
  - 验收：typecheck、lint 通过；Vitest 44 files / 186 tests 全过（另 1 个 Phase 9 live test 默认跳过）；build（404 modules）、构建安全扫描与本阶段文件格式检查通过；记录 D-049
- [x] **Phase 11 — 自动测试、打包与体验复核准备（2026-07-24）完成**：
  - Playwright 加载真实 `dist` 扩展和隔离 Chrome for Testing；Options 用户点击打开原生 Side Panel API 成功，自动 DOM 断言使用同扩展 Panel 文档（原生 target 不向 Playwright 暴露，边界已记录）
  - E2E 使用固定 GitHub/API fixture，验证仓库分析卡 API 事实、SPA 后刷新为 Issue #42、Content 实例仍为 1、会话写入及 Panel 重载恢复；全程 Provider 请求 0、页面异常 0
  - 发布前复审修复 D-051：用户问题先在 PanelBridge 脱敏，再进入 SessionStore/Provider；假 Key 哨兵未进入 storage，Panel 重载后也无明文
  - S1–S5 自动证据映射完成，见 `scripts/phase11-acceptance-evidence.md`；真实使用与批量复核步骤见 `docs/USER_GUIDE.md`
  - `dist/` 为可加载扩展；`artifacts\GitHelper-CN-v0.1.0.zip` 含 13 个条目且根目录 manifest 校验通过，SHA-256 `6ddfb157d3416105aa04a038430c948f0c44d590aa1730d250d2f433ebb96e6e`
  - 自动门禁：typecheck、lint 通过；Vitest 44 files / 187 tests 全过（另 1 个 Phase 9 live test 默认跳过）；build（404 modules）、构建安全扫描与隔离 Chrome E2E 通过；记录 D-050/D-051
- [x] **Phase 11 — 首轮人工复核补丁（2026-07-27）完成**：
  - 对话 System Prompt 增加结论先行、普通回答默认 ≤400 中文字符、复杂任务 ≤6 个短要点及无寒暄/复述/重复总结约束；准确性和必要不确定性说明优先
  - 分析区与问答区可独立收起/展开；点击/框选成功后提供“下一步：输入问题”并聚焦输入框
  - 最近会话可显式选择或新建；活动会话以 `storage.session` 轻量指针恢复，页面切换和 Background hydrate 不再清空或自动替换当前对话
  - fenced code 与行内代码样式分离，修复代码块前景色/背景色冲突；记录 D-052
  - 自动门禁：typecheck、lint 通过；Vitest 45 files / 195 tests 全过（另 1 个 Phase 9 live test 默认跳过）；build（405 modules）、构建安全扫描与隔离 Chrome E2E 通过；E2E 明确 `survivedPageSwitch=true`
  - 最新本地包 `artifacts\GitHelper-CN-v0.1.0.zip` 含 13 个条目，SHA-256 `7de4e27625a67bd9687ba789ce6eb5ba67956dca18fdf35e3b1acb24d90cd0b7`
- [x] **Phase 11 — 第二轮人工复核补丁（2026-07-27）完成**：
  - 仓库分析改为文件证据优先：固定 GitHub Contents API 受限读取根目录、最多 2 个高信号源码目录与 3 个关键文件；单候选 ≤24KB、正文只取前 4KB，拒绝锁文件和不安全路径，原始正文不持久化
  - 卡片新增“项目文件洞察”，展示目录、文件路径/角色与清单脚本、依赖或源码定义；语言比例降为最多 5 项次要信息；Provider 必须优先依据经脱敏的不可信文件证据分析
  - 每轮问题左侧 `>/∨` 独立收展；回复右上角 `🗑` 与 session 管理列表均先展开 `✓/×`，仅 `✓` 删除。问答删除按 user message ID 限定到下一问题前，不误删相邻轮次；删除活动 session 同步清除活动指针
  - 记录 D-053；自动门禁：typecheck、lint 通过；Vitest 45 files / 201 tests 全过（另 1 个 Phase 9 live test 默认跳过）；build（405 modules）、构建安全扫描与隔离 Chrome E2E 通过；E2E 文件证据为 `package.json` / `src/server.js`，Provider 请求 0、页面异常 0
  - 最新本地包 `artifacts\GitHelper-CN-v0.1.0.zip` 含 13 个条目，SHA-256 `832582c809215a0b54cd13833eadef4303e8d67d296b7c255a685a11c89a26b1`
- [x] **Phase 11 — 第三轮人工复核补丁（2026-07-28）完成**：
  - README 在既有最多 3 文件、单候选 ≤24KB、正文 ≤4KB 的 D-053 配额内提升为最高优先级；API 与 DOM 同时存在时优先采用已校验 API 片段，没有扩大目录深度、请求 Host、文件预算或持久数据
  - 固定卡片新增 README 概括、主要功能、配置/运行和简单实现速览；Provider Prompt 要求简练中文，Provider 缺字段/失败时由 Markdown 段落、功能章节、安装命令及实际文件证据确定性降级
  - Panel 默认先展示 README/功能/文件配置；Star、Issue/PR、语言、平台、Release、许可证等移入默认关闭且可展开的“仓库事实”
  - 记录 D-054；自动门禁：typecheck、lint 通过；Vitest 45 files / 201 tests 全过（另 1 个 Phase 9 live test 默认跳过）；build（406 modules）、构建安全扫描与隔离 Chrome E2E 通过；E2E 断言 README 功能、`package.json` / `src/server.js` 证据及事实区默认折叠，Provider 请求 0、页面异常 0
  - 最新本地包 `artifacts\GitHelper-CN-v0.1.0.zip` 含 13 个条目，SHA-256 `c579144a4d6800fabb5cfcb12efa4ac79e5d6e89184bb9db409fa357cee1394a`
- [x] **Phase 11 — 第四轮人工复核补丁（2026-07-28）完成**：
  - 修复多语言 README 抢占全部 3 个文件名额：只选 1 份 README，根目录默认优先；默认缺失时优先根目录中文/其他本地化说明，再考虑嵌套 README，配置和入口文件仍有名额
  - README 本地提取跳过 banner、badge、居中导航与 `�`，新增 HTML 功能表解析；真实 `NousResearch/hermes-agent` 的功能组织方式已用于确定性回归设计
  - Provider 合法但字段不全的 JSON 经白名单 `RepositoryInsightPatch` 投影后与本地完整结果合并；Star 等未知事实字段丢弃，不再因缺少非必要字段整份失败或触发无必要重试
  - Contents 文件详情二次校验响应路径及 `(0, 24KB]` 大小，保持最多 3 文件、2 个目录、每文件 4KB 文本预算不变；记录 D-055
  - 自动门禁：定向回归 22/22；typecheck、lint 通过；Vitest 45 files / 204 tests 全过（另 1 个 Phase 9 live test 默认跳过）；build（406 modules）、构建安全扫描与隔离 Chrome E2E 通过
  - E2E 使用多语言 README + HTML banner/功能表，默认卡片无 `�`/原始 `<img>`，仍显示 `package.json` / `src/server.js`；Provider 请求 0、页面异常 0
  - 最新本地包 `artifacts\GitHelper-CN-v0.1.0.zip` 含 13 个条目，SHA-256 `0adbe7ddf37d4583c846dffc556c746c11b42d5ab567aca90e85ff2d37f53d80`
- [x] **Phase 11 — 第五轮人工复核补丁（2026-07-28）完成**：
  - 修复中文界面仍选择英文默认 README：根目录中文 README 现在优先于根目录默认 README，仍只占 1 个文件名额且不改变请求/文本预算
  - 本地用途优先中文 description/README；Provider 自然语言字段必须为简体中文，英文结果最多重试一次；展示层不再让英文 description、概括或功能项覆盖中文结果
  - 只有外文证据且 Provider 不可用时显示明确中文降级说明，不把英文原文冒充中文速览；记录 D-056
  - 自动门禁：定向回归 24/24；typecheck、lint 通过；Vitest 45 files / 206 tests 全过（另 1 个 Phase 9 live test 默认跳过）；build（406 modules）、构建安全扫描与隔离 Chrome E2E 通过
  - E2E 同时提供 `README.md` 与 `README.zh-CN.md`，实际选择中文文件并断言中文概括/功能存在、英文默认功能句不存在；Provider 请求 0、页面异常 0
  - 最新本地包 `artifacts\GitHelper-CN-v0.1.0.zip` 含 13 个条目，SHA-256 `72b09c39b852941db656e43d5b6c08e64fd18c07ee772502e93a28757273e0f3`
- [x] **Phase 11 — 第六轮人工复核补丁（2026-07-28）完成**：
  - 仓库分析 Schema 拆为 `overview`（AI 新手总结）、`details`（详细解释）、`sourceSummary`（本地原文件证据），Provider 不再覆盖 README/配置/实现的确定性摘要
  - Panel 只默认显示“总结速览”；“详细介绍”“原项目文件摘要”“仓库事实”均默认折叠，专业字段和关键文件不会挤占首屏
  - Provider Prompt 要求理解后按自然中文重组，禁止逐句翻译、英文句序和字段清单；有项目证据时必须返回 1–2 句总结与至少 2 个价值要点，失败沿用既有最多一次重试
  - 中文校验允许纯命令、路径、包名和代码标识符保留原文，但普通英文技术解释仍须重写为中文；记录 D-057
  - 自动门禁：定向回归 35/35；typecheck、lint 通过；Vitest 45 files / 211 tests 全过（另 1 个 Phase 9 live test 默认跳过）；build（406 modules）、构建安全扫描与隔离 Chrome E2E 通过
  - E2E 断言 `overview` 为唯一默认内容，`details` / `sourceSummary` / `facts` 均默认折叠；展开后中文 README、`package.json` / `src/server.js` 证据及事实数字可见；Provider 请求 0、页面异常 0
  - 最新本地包 `artifacts\GitHelper-CN-v0.1.0.zip` 含 13 个条目，SHA-256 `c795e80b7d5bc92bbe9236d924ff7dee68585ef255828272cafd0b7cd855a6eb`

## 下一任务
**Phase 11 强制确认节点 ② — S1–S5 批量体验复核**（见 `docs/USER_GUIDE.md` 第 9 节）。
用户在真实 Chrome 重新加载最新 `dist/` 后，复核 S1–S5 及前六轮人工问题；确认全部通过后，执行 Agent 才能标记 MVP 完成并创建 Phase 11 最终验收提交。

## 阶段进度表
| Phase | 状态 |
|---|---|
| 0 基线检查 + 环境 + 技术探针 + Git 初始化 | ✅ 已完成 |
| 1 仓库结构 + 扩展骨架 | ✅ 已完成 |
| 1.5 安全地基 | ✅ 已完成 |
| 2 Side Panel + 消息通信 | ✅ 已完成 |
| 3 页面识别 + 上下文 + SPA | ✅ 已完成 |
| 4 Provider + 能力探针 + 对话 + 手动切换 | ✅ 已完成 |
| 5 Session + 偏好 + 容量淘汰 | ✅ 已完成 |
| 6 点击提问（MVP 必达） | ✅ 已完成 |
| 7 框选 + 视觉（MVP 必达） | ✅ 已完成 |
| 8 NL 搜索（MVP 必达） | ✅ 已完成 |
| 9 一键仓库分析 | ✅ 已完成 |
| 10 安全加固 + 红队测试 | ✅ 已完成 |
| 11 测试 + 打包 + MVP 验收 | ⏸ 前六轮问题补丁自动验收通过，待人工复核 |

## 待处理的强制确认节点
- ✅ Phase 4：填入真实 Provider Key（用户已确认完成）
- ✅ 所有视觉 Provider 首轮失败后的第二轮复探针成本确认（已授权并执行）
- ✅ 第二轮视觉仍失败后的第三轮 `openrouter/free` fallback 真实确认（已授权、执行并通过）
- ✅ DeepSeek V4 非思考修复后的单 Provider 真实复测（只调用 DeepSeek，文本已验证）
- ⏸ Phase 11：MVP 批量体验复核（必需）
- ⏸ 条件性：匿名 GitHub API 限额实测阻塞 MVP → 评估 Token（基线变更）；所有文本或所有视觉 Provider 真实探针均失败（D-031）；触及付费/权限扩大/发布/Git Remote 与 Push → 即时暂停

## 阻塞
仅等待 Phase 11 规定的真实 Chrome S1–S5 与前六轮问题补丁复核；无其他实现、安全、权限或 Provider 阻塞。

## 变更记录
- 2026-07-23：完成全部规划文档，基线冻结 v1.0。
- 2026-07-24：目录更名为 `C:\AI_GitHelper-CN` 并冻结为唯一项目根；完成 v1.1 定向修订（安全/权限/MV3/Provider 兼容/GitHub 边界/Git 治理/一致性/验收可执行性），未写任何项目代码。
- 2026-07-24：完成 v1.2 最终定点修订（D-028~D-035 + D-007R/D-013R），未写任何项目代码。
- 2026-07-24：只读基线检查时修正“下一任务”中的执行方案版本引用（v1.1 → v1.2）；仅为文档引用纠正，不改变基线范围。
- 2026-07-24：Phase 0 通过；完成 Git 基线、最小 MV3 构建、A–D 自动探针、截图坐标与最小权限定稿，并记录 CRXJS/Vite 入口 basename 兼容约束（D-036/D-037）。
- 2026-07-24：Phase 1 通过；数据模型、目录骨架及 storage/messaging/logger 共享库落地，10 项单测通过。
- 2026-07-24：Phase 1.5 通过；凭据隔离、Host 白名单、安全消息路由、脱敏、私有上下文零出站、Prompt 隔离及构建扫描落地，25 项单测通过。
- 2026-07-24：Phase 2 通过；Panel/Options UI 骨架、三端安全通信、页面信息往返及流式占位落地，29 项单测与真实浏览器加载复验通过。
- 2026-07-24：Phase 3 通过；六类页面解析、有限降级、私有/无权限零出站、SPA 去抖与 Content 幂等入口落地，42 项单测及真实浏览器复验通过。
- 2026-07-24：Phase 4 无凭据工作完成；三适配器、能力探针框架、Manager/Panel/Options/凭据 UI 与 58 项测试通过，按强制确认节点 ① 暂停等待用户在 Options 页录入真实 Key。
- 2026-07-24：用户确认真实 Key 已在 Options 页录入；真实探针消息超时改为 10 分钟并通过 58 项回归测试。Chrome 自动化接口禁止访问扩展内部页，等待用户从 UI 触发一次探针。
- 2026-07-24：真实探针按钮原先只在页面顶部显示状态，导致当前视口内看似无反应；现已增加卡片内即时状态、运行态按钮与防重复提交，并由新增 UI 回归测试覆盖。
- 2026-07-24：真实探针完成后因完整报告约 107KB 超过 64KB 消息上限而在 UI 报错；探针摘要已先持久化。路由现只回传紧凑 Provider 状态，Provider 卡片显示文本/视觉结果与失败原因，并新增超大报告和 UI 回归测试。
- 2026-07-24：首轮真实结果为 OpenRouter 文本通过、DeepSeek 文本失败、UUAPI HTTP 502、视觉路线全未通过。修复视觉模型自动选择、32×32 样例图与视觉失败原因记录后，按 D-031/新增成本规则暂停等待一次复探针确认。
- 2026-07-24：用户授权一次修复版真实能力复探针；等待其重新加载扩展后从 Options UI 触发。
- 2026-07-24：第二轮真实探针确认 OpenRouter 文本通过但 `~openai/gpt-latest` 视觉返回空内容，UUAPI 账户耗尽。增加 `openrouter/free` 视觉 fallback 并通过 63 项测试，按 D-031/新增请求规则再次暂停。
- 2026-07-24：用户授权第三轮真实复探针，用于验证 `openrouter/free` 视觉 fallback。
- 2026-07-24：第三轮真实探针通过：UUAPI/OpenRouter 文本已验证，OpenRouter 视觉已验证；记录 D-038，等待一次真实流式对话后完成 Phase 4。
- 2026-07-24：根据 DeepSeek 官方 V4 文档定位其默认 Thinking 会与 16-token 探针预算冲突；适配器改为显式非思考模式，并增加只调用指定 Provider 的复测入口。记录 D-039；本地 66 项测试及全套静态/构建验证通过，等待 DeepSeek 单家真实复测。
- 2026-07-24：第四轮仅复测 DeepSeek，文本显示“已验证”；D-039 得到真实端点验证，默认低成本文本路线恢复。等待一次 DeepSeek 真实流式对话后完成 Phase 4。
- 2026-07-24：真实 Side Panel 复验发现 action 未直接打开、发送键因 StrictMode 旧连接回调误置为离线、Enter 只换行。三项均以红测复现后修复，记录 D-040；全量 69 项测试与构建验证通过，等待真实 UI 复验。
- 2026-07-24：D-040 三项交互及 DeepSeek 首轮真实流式回答均通过；回答完成后 port 断开导致永久离线。增加 D-041 自动重连与退避，生命周期红测及全量 70 项测试通过，等待真实连续两轮复验。
- 2026-07-24：DeepSeek 连续两轮真实对话成功，D-041 通过实测。随后补充 D-042 安全 Markdown/GFM 展示并通过 71 项测试；Phase 4 全部验收通过，准备阶段提交并进入 Phase 5。
- 2026-07-24：Phase 5 通过；会话持久化/恢复、本地摘要与有限历史、30 天/50 会话/容量淘汰、收紧偏好 Schema、Options 容量显示及 D-033 三种数据清除落地；87 项测试及全套静态/构建验证通过，记录 D-043/D-044，准备进入 Phase 6。
- 2026-07-24：Phase 6 通过；点击选择叠层、逻辑元素提取、Panel 状态/预览、SelectedElement AI 上下文闭环及 SPA 旧选择阻断落地；95 项测试及全套静态/构建验证通过，记录 D-045，准备进入 Phase 7。
- 2026-07-24：Phase 7 通过；区域结构化提取、充分性判定、可信截图裁剪、视觉偏好/Capability/费用护栏及截图不持久化落地；107 项测试及全套静态/构建验证通过，记录 D-046，准备进入 Phase 8。
- 2026-07-24：Phase 8 通过；本地中文 GitHub 查询转换、仓库/Issue 匿名搜索、只读工具白名单、独立 search 限流桶、网页/DOM 降级与结果卡落地；126 项测试及全套静态/构建验证通过，记录 D-047，准备进入 Phase 9。
- 2026-07-24：Phase 9 通过；匿名 core 事实聚合、固定结构化分析卡、Provider Schema 降级与事实回填、DOM/限流降级及三仓库真实匿名验收完成；143 项常规测试与独立 live test 通过，记录 D-048，准备进入 Phase 10。
- 2026-07-24：Phase 10 通过；扩展 sanitizer、统一敏感消息字段、完整只读工具注册表、私有页入口零出站、权限/三种清除/出站体/日志复验及 12 个注入样例完成；186 项常规测试与全套静态/构建验证通过，记录 D-049，进入 Phase 11。
- 2026-07-24：Phase 11 自动部分通过；真实扩展 fixture E2E、S1–S5 证据、可加载 dist、本地 zip 与使用说明完成，并修复问题明文进入 Session 的发布前缺口（D-050/D-051）；187 项常规测试及全套门禁通过，按强制确认节点 ② 暂停等待批量体验复核。
- 2026-07-27：Phase 11 首轮人工复核补丁完成；精炼回答契约、分析/问答折叠、最近会话选择/新建、点击/框选下一步 CTA、fenced code 渲染与跨 GitHub 页面活动会话保持全部落地（D-052）；195 项常规测试及完整 E2E/构建门禁通过，等待用户复核。
- 2026-07-27：Phase 11 第二轮人工复核补丁完成；仓库分析改为受限实际文件证据优先，逐轮 `>/∨` 收展与问答/session `🗑 → ✓/×` 删除落地（D-053）；201 项常规测试及完整 E2E/构建门禁通过，等待用户复核。
- 2026-07-28：Phase 11 第三轮人工复核补丁完成；README/功能/配置/实现速览前置，仓库事实默认折叠（D-054）；201 项常规测试及完整 E2E/构建门禁通过，等待用户复核。
- 2026-07-28：Phase 11 第四轮人工复核补丁完成；多语言 README 去重、HTML 功能表与乱码清洗、Provider 部分结果合并、文件详情大小复核落地（D-055）；204 项常规测试及升级后的完整 E2E/构建门禁通过，等待用户复核。
- 2026-07-28：Phase 11 第五轮人工复核补丁完成；根目录中文 README 优先、用途/功能中文合并、Provider 中文叙述校验与英文降级阻断落地（D-056）；206 项常规测试及中英文 README 共存 E2E/构建门禁通过，等待用户复核。
- 2026-07-28：Phase 11 第六轮人工复核补丁完成；新手总结/详细解释/原文件证据三层分离、自然中文重组与长度约束、技术标识符与英文解释分流校验及三块默认折叠落地（D-057）；211 项常规测试及完整 E2E/构建门禁通过，等待用户复核。

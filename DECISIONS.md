# DECISIONS.md — 决策日志

> 记录所有对产品/架构/成本/安全有影响的决策及理由。
> 内部实现变更可自主追加记录；基线级变更须先经确认再记录。
> 格式：`[编号] 决策 | 理由 | 状态 | 日期`

---

## D-001 语言与类型：TypeScript（strict）
- **决策**：全项目 TypeScript，`strict: true`。
- **理由**：消息在 content/background/panel 间传递，强类型能在编译期挡住大量结构错误；执行 Agent 修 TS 错误比修运行时 bug 便宜。
- 状态：冻结 ｜ 2026-07-23

## D-002 构建工具：Vite + `@crxjs/vite-plugin`
- **决策**：用 Vite 打包，CRXJS 插件处理 MV3 manifest、HMR、多入口（background/content/panel/options）。
- **理由**：MV3 多入口手写 Rollup 配置成本高；CRXJS 是当前社区最成熟的 MV3 + Vite 方案，支持热重载，显著加快原型迭代。备选（webpack、手写 esbuild）配置更重，收益不明显。
- **回退**：若 CRXJS 与 MV3 未来版本冲突，回退到 Vite 手写多入口 + `manifest.json` 静态维护。
- 状态：冻结 ｜ 2026-07-23

## D-003 UI 框架：React 18 + TypeScript
- **决策**：Side Panel 与 Options 页用 React 18 函数组件 + Hooks。
- **理由**：Side Panel 有会话列表、消息流、设置表单等有状态 UI，React 生态与招聘/AI 生成代码支持最好；对非专业前端也最易读。备选 Vue/Svelte 同样可行，选 React 纯粹因生态与 Agent 友好度。
- 状态：冻结 ｜ 2026-07-23

## D-004 样式：Tailwind CSS
- **决策**：Tailwind 原子类，少量全局 CSS 变量控制主题。
- **理由**：扩展 UI 小而多，Tailwind 免去命名与切文件，AI 生成一致性高。
- 状态：冻结 ｜ 2026-07-23

## D-005 状态管理：Zustand + chrome.storage 持久化封装
- **决策**：面板内轻状态用 Zustand；跨上下文持久数据走统一 `storage` 封装（chrome.storage.local）。
- **理由**：Redux 对本项目过重；Zustand 极简、无 boilerplate，适合 MVP。持久层单独封装以便未来迁移。
- 状态：冻结 ｜ 2026-07-23

## D-006 存储：chrome.storage.local 统一封装（带 schema 版本号）
- **决策**：所有持久数据经 `lib/storage` 读写，每类数据带 `schemaVersion`，预留迁移函数。
- **理由**：MV3 Service Worker 随时休眠，内存态不可靠，必须落 storage；版本号防止未来数据结构变更破坏旧数据。
- 状态：冻结 ｜ 2026-07-23

## D-007 AI Provider 抽象：公共协议骨架 + 独立适配器 + 能力探针（v1.2 修订）
- **决策（v1.2 修订版，由 D-021 补充、D-030 定稿）**：
  - 定义公共 `Provider` 协议骨架（`chat()` / `chatStream()` / `abort()` / capabilities 声明），基于 OpenAI 兼容 `chat/completions` 组装请求。
  - 每个 Provider（DeepSeek / UUAPI / OpenRouter）是**独立适配器**，可各自覆写：请求头、模型名映射、流式解析差异、工具调用格式、错误/限流响应格式、usage 字段差异。
  - ~~"差异仅在 baseURL / model / headers"~~ 该原表述**作废**——中转端点在流式工具调用、结构化输出、错误格式上的差异真实存在，必须由 **Capability 探针（D-021）** 验证后才可使用对应能力。
- **理由**：三家宣称 OpenAI 兼容，但兼容程度只有探针能证明；把差异面预设得过窄会导致适配器无处安放实测差异。
- **联网核实（2026-07-23）**：来源：https://api-docs.deepseek.com/ 、 https://uuapi.net/docs
- 状态：冻结（v1.2 替代原 D-007；模型名策略见 D-034）｜ 2026-07-24

## D-008 Provider 路由 + 手动切换（含用户补充）
- **决策**：
  - 默认路由：**文本 → DeepSeek**（成本最低）；**视觉 → UUAPI**（DeepSeek 不支持图像）；**兜底 → OpenRouter**。
  - **手动切换（用户明确要求）**：设置页可**分别配置**"文本 Provider"和"视觉 Provider"；Side Panel 顶部提供 **Provider 下拉**，用户可随时手动指定当前对话使用哪家 + 哪个 model。**手动选择优先级高于默认路由**。
  - 安全护栏：当用户手动把视觉请求指向不支持视觉的 Provider（如 DeepSeek）时，UI 明确提示并阻止发送，建议切换到视觉 Provider（不静默失败）。
- **理由**：成本/能力在 DeepSeek/UUAPI/OpenRouter 间因任务而异，自动路由只能给默认；把控制权交回用户，符合"真实优先"与可验证原则。
- 状态：冻结 ｜ 2026-07-23

## D-009 API Key 处理：BYOK + 可信上下文隔离存储（v1.1 修订，P0-1/P0-2）
- **决策**：
  - Key 仅存 `chrome.storage.local`，初始化即 `setAccessLevel('TRUSTED_CONTEXTS')`，Content Script 无访问权。
  - 凭据用独立结构 `ProviderCredential` + 独立接口 `credential-store`（唯一明文读取点；v1.2 由 D-028 细化：Options 只 write/delete、Background 只 read/inject、Content 禁止导入）；不进 UI 状态/Session/日志/导出/消息载荷。
  - 数据流向准确表述：Key 与请求数据发送到**用户选择并授权的 API 端点**（中转端点可能转交上游），扩展不承诺控制第三方后续处理；设置页披露 Provider/Host/模型/流向/中转性质/换端点风险。
  - 明示浏览器存储非加密保险箱；BYOK 限个人原型；建议专用/可撤销/限额 Key。
- **理由**：原表述"绝不发往任何第三方服务器"与 BYOK 直连中转端点矛盾；storage.local 默认对 Content Script 暴露，必须显式限制。
- **首次填入真实 Key 仍为强制确认节点**。
- 状态：冻结（v1.1 替代原 D-009）｜ 2026-07-24

## D-010 GitHub 数据获取：DOM 优先 + 匿名 REST API，v1 无 Token（v1.1 修订，P0-7）
- **决策**：
  - 页面能读的优先 DOM；结构化数据走 GitHub REST API，**匿名调用**（core 60 次/小时；search 独立且更低配额，分桶见 D-032）。
  - 缓解限额：本地缓存 + 按 resource 分桶节流（D-032 细化）+ 超限降级纯 DOM 并提示。
  - **v1 不保存、不使用任何 GitHub Token**；无 Token 设置界面；私有仓库/无权限页面直接提示"不在当前版本支持范围内"，零出站。
  - 只有真实测试证明匿名限额阻塞 MVP，才另立决策评估细粒度 Token（基线变更）。
- **理由**：Token 引入第二套敏感凭据、更复杂权限模型与更大测试面，与"仅公开页面"的 MVP 不成比例；原 `scope:'readonly'` 也不是 GitHub 细粒度 Token 的准确表达。
- 状态：冻结（v1.1 替代原 D-010）｜ 2026-07-24

## D-011 DOM 解析策略：按页面类型的解析器 + 稳定选择器优先
- **决策**：以 URL + 页面特征识别页面类型（repo/issue/pr/releases/blob/search 等），每类型一个 parser 模块；选择器优先用语义/ARIA/稳定属性，避免依赖易变 class；解析失败要降级不报错。
- **理由**：GitHub 会改版，解析必须容错、可局部替换。
- 状态：冻结 ｜ 2026-07-23

## D-012 视觉模型策略：结构化不足才截图，局部优先
- **决策**：仅当 DOM/API 无法获取（图片/流程图/canvas/特殊渲染/用户明确框选视觉关系）时，截**局部**图调用视觉 Provider；调用前提示消耗额度；设置可全局关闭视觉。
- 状态：冻结 ｜ 2026-07-23

## D-013 工具调用：白名单 + 参数 schema 校验（v1.2 修订：openPage 拆分限域）
- **决策**：模型只能调用预定义白名单工具，每工具参数用 zod 校验，越权/写操作类工具 v1 不提供。
- **v1.2 修订（导航工具拆分）**：
  - 原 `openPage` 拆为：`openGitHubPage`（仅 `https://github.com/*`，navigation 类）+ `openExternalLink`（外部链接，逐次确认 external 类）+ 下载类操作（逐次确认 download 类）。
  - 所有导航/打开类工具**拒绝非 `https:` Scheme**（`javascript:` / `data:` / `file:` / `chrome:` / `chrome-extension:` / `blob:` / `vbscript:` 等），zod 校验 + 执行端二次校验双层拦截。
- **理由**：防模型幻觉误操作、防 Prompt Injection 越权；单一 openPage 若可开任意 URL，等于给注入内容一个受信跳板。
- 状态：冻结（v1.2 修订）｜ 2026-07-24

## D-014 测试：Vitest（单元/组件）+ Playwright（扩展集成，后期）
- **决策**：逻辑与解析用 Vitest + jsdom/fixtures；扩展端到端用 Playwright（`--load-extension`），集成测试在后期阶段引入，不阻塞早期。
- **理由**：Vitest 与 Vite 同源、快；Playwright 是 MV3 E2E 事实标准。
- 状态：冻结 ｜ 2026-07-23

## D-015 校验库：zod
- **决策**：工具参数、存储数据、Provider 配置统一用 zod 校验。
- 状态：冻结 ｜ 2026-07-23

## D-016 日志：分级 logger 封装 + 开发/生产开关
- **决策**：`lib/logger` 统一封装（debug/info/warn/error），生产默认只 warn/error；**日志绝不记录 API Key / Token / 完整页面内容**。
- 状态：冻结 ｜ 2026-07-23

## D-017 代码规范：ESLint + Prettier + TypeScript strict
- **决策**：ESLint（含 `@typescript-eslint`）+ Prettier，CI 前置检查。
- 状态：冻结 ｜ 2026-07-23

## D-018 包管理与 Node：pnpm + Node LTS
- **决策**：pnpm（磁盘友好、快）；Node 版本锁 `.nvmrc` / `package.json#engines`。
- 状态：冻结 ｜ 2026-07-23

## D-019 国际化：v1 仅中文（zh-CN），但文案集中化
- **决策**：UI 文案集中在 `locales/zh-CN`，为未来多语言留结构，但 v1 不做多语言切换。
- **理由**：目标用户是中文用户，多语言是非目标；集中化只为可维护。
- 状态：冻结 ｜ 2026-07-23

---

# v1.1 定向修订新增决策（2026-07-24，依据《修订任务单》）

## D-020 固定 Provider 端点，v1 禁自定义 Base URL（P0-3）
- **决策**：v1 仅支持三个预定义 API Host（`api.deepseek.com` / `uuapi.net` / `openrouter.ai`）。用户可填 Key、可选 model，**不能修改 Base URL**。manifest host 权限静态列举这三域 + github 两域，闭合一致。
- **理由**："任意 Base URL"与"少量固定 host 权限"不兼容；个人 MVP 固定端点最简单且安全。自定义端点延后（届时须 `optional_host_permissions` + 运行时授权 + HTTPS 强制 + 精确域名校验，属基线变更）。
- 状态：冻结 ｜ 2026-07-24

## D-021 Provider Capability 模型 + 能力探针（P0-6；对 D-007 的能力验证补充）
- **决策**：每个 Provider 声明 `ProviderCapabilities`（streaming/vision/toolCalls/structuredOutput/usage/abort/imageInputFormat/toolCallStreamingFormat/errorResponseFormat）。首次 Provider 阶段（Phase 4）运行**能力探针**：文本、流式、取消、图片输入、工具调用、结构化输出、错误与限流响应。探针结果写入 `capabilities.probedAt`，**未经探针验证的能力不得写成既定事实**；structuredOutput 不可用时降级为 prompt 约束 + 本地 zod 校验重试。
- **与 D-007 的关系**：D-007（v1.2）定义"公共协议骨架 + 独立适配器"，D-021 提供其能力验证机制；两者共同替代原 D-007 "差异仅在 baseURL/model/headers" 的过窄假设。
- **理由**："OpenAI 兼容"是宣传口径，不同中转端点在流式工具调用、结构化输出、usage 返回上差异真实存在。
- 状态：冻结 ｜ 2026-07-24

## D-022 v1 移除 GitHub Token 与私有仓库支持（P0-7）
- **决策**：见 D-010（v1.1 修订）。数据模型删除 `GitHubTokenConfig`；偏好删除 `allowPrivateRepos`；删除相关设置界面与确认节点。
- 状态：冻结 ｜ 2026-07-24

## D-023 Git 基线、阶段提交与回滚（P0-8）
- **决策**：
  - `C:\AI_GitHelper-CN` = 唯一项目根 = 唯一本地 Git 仓库根，禁止嵌套项目根。
  - 执行 Agent 首轮：若非 Git 仓库则 `git init` + 建 `.gitignore`（node_modules/、dist/、.env、.env.*、密钥文件、临时截图、测试输出、构建缓存、浏览器本地数据副本）+ 把冻结规划文件作为基线提交。
  - 每 Phase 通过验收 → 更新 STATUS + 记录测试证据 → 本地 commit（信息含 Phase 号与完成内容）。
  - 阶段失败：优先修复；无法安全修复 → 回退到最近通过验收的阶段提交；禁止删测试/降标准过关。
  - 未经用户明确授权禁止：加 Remote、Push、Force Push、建远程仓库、公开 Release、发布扩展、改工作目录外文件、改系统代理、改全局 Chrome/Node 配置、安装来源不明脚本。
- **理由**：Codex 长时间自主执行必须有可回滚基线。
- 状态：冻结 ｜ 2026-07-24

## D-024 操作策略收紧 + 高风险不可永久放行（C-3）
- **决策**：`operationPolicy` 类型收紧为 `navigation/search: 'auto'|'confirm'`，`downloads: 'confirm'|'deny'`（无 auto），`accountChanges: 'deny'`（固定，v1 无账号写入）。确认弹窗只有 [允许本次]/[拒绝]，**无"始终允许该类"**。
- 状态：冻结 ｜ 2026-07-24

## D-025 规划文件唯一权威 + Claude_Prompt 降级（C-1）
- **决策**：8 份规划文件只在根目录保留唯一版本，不复制到 `docs/`（docs 只放派生使用文档）。`Claude_Prompt.md` 移至 `references/`，仅历史追溯；冲突时以基线→AGENTS→SECURITY→EXECUTION_PLAN→ACCEPTANCE 顺序裁决。
- 状态：冻结 ｜ 2026-07-24

## D-026 存储分区与容量淘汰（P1-1）
- **决策**：storage.session 放即时页面状态；storage.local（TRUSTED_CONTEXTS）放偏好/配置/索引/摘要/凭据（独立前缀）；IndexedDB 预留（逼近配额才启用）；截图不持久保存。限额与淘汰顺序见 ARCHITECTURE §8；`getBytesInUse()` 写入前检查。
- 状态：冻结 ｜ 2026-07-24

## D-027 消息协议安全（P1-3）
- **决策**：统一信封含协议版本/请求 ID/固定 type；收端 zod 校验 + sender 来源检查 + 最大载荷 + 超时 + 类型化错误；SW 拒绝代 fetch 任意 URL（域名白名单）；凭据永不进消息。
- 状态：冻结 ｜ 2026-07-24

---

# v1.2 最终定点修订新增决策（2026-07-24）

## D-028 凭据录入与保存路径（细化 D-009R）
- **决策**：
  - `credential-store` 为**仅可信扩展上下文可导入**的共享模块，职责按上下文分离：**Options 只 write/delete；Background 只 read/inject（Header 注入路径唯一）**；Content Script **禁止导入**。
  - 双重保护：运行时 `storage.local` TRUSTED_CONTEXTS 访问级 + 构建期 lint/import 边界（禁止 `src/content/**` 引用 credential-store）。
  - 明文 Key 的合法短暂存在窗口**只有一个**：Options 页用户主动录入的 `<input type="password">`；保存成功后立即清空输入框与受控组件状态。
  - 已保存明文**不回显**（仅尾 4 位掩码，Background 计算下发），不进 Zustand/Session/日志/普通消息/导出。
- **理由**：原"明文不出现于 DOM/状态"是不可实现的绝对条件（用户录入瞬间明文必然在 input DOM 与组件状态中）；改为精确定义唯一合法窗口 + 保存后清空 + 已存明文不回显，才是可测试的真实边界。
- 状态：冻结 ｜ 2026-07-24

## D-029 截图坐标换算由 Phase 0 探针 B 实测定稿
- **决策**：
  - 删除规划期写死的"矩形 × dpr × 缩放，扣除滚动偏移"公式；**最终换算方法以 Phase 0 探针 B 真实环境实测结论为准**（记入 `scripts/probe-results.md` 并回写 ARCHITECTURE §3.5）。
  - 探针首选假设：`scaleX = 截图实际像素宽 / 视口 CSS 宽`（`scaleY` 同理），天然吸收 DPI/缩放/Side Panel 挤压的综合影响。
  - `getBoundingClientRect()` 返回**视口坐标**，**不得默认再次扣除 scroll**；滚动补偿只在坐标来源为文档坐标时才考虑。
  - `SelectedRegion` 增加 `viewport: {cssWidth, cssHeight}` 字段供比例计算。
- **理由**：dpr×zoom 推导公式在 Windows 高 DPI + 浏览器缩放 + Side Panel 挤压视口的组合下有多个已知坑；提前写死会诱导执行 Agent 跳过实测。
- 状态：冻结 ｜ 2026-07-24

## D-030 D-007 修订定稿：公共协议骨架 + 独立适配器
- **决策**：正式作废 D-007 原表述"Provider 差异仅在 baseURL/model/headers"；定稿为**公共协议骨架（chat/chatStream/abort/capabilities）+ 每 Provider 独立适配器（可覆写请求头/模型映射/流式解析/工具调用格式/错误格式/usage 差异）+ D-021 能力探针验证**。
- **关系标注**：D-007（v1.2 修订版）为接口定义，D-021 为能力验证机制，D-030 记录本次修订关系。
- 状态：冻结 ｜ 2026-07-24

## D-031 Phase 4 Provider 可用性判定与降级（不因单家失败阻塞 MVP）
- **决策**：
  - **代码完成度要求**：三个 Provider 适配器 + Mock 测试**必须全部完成**（不受真实端点可用性影响）。
  - **真实端点要求**：MVP 只强制**至少一个文本 Provider + 一个视觉 Provider** 经真实探针可用。
  - 单个外部 Provider 真实探针失败 → 在 `capabilities`/探针报告记录失败原因 → UI 标记该 Provider 不可用并禁用选择 → **继续推进，不阻塞**。
  - **仅当所有文本路线全失败，或所有视觉路线全失败**时，才触发暂停找用户（属外部依赖阻塞，非代码问题）。
- **理由**：外部中转服务的可用性不受项目控制；把三家全部真实可用设为硬门槛会让 MVP 被第三方单点故障劫持。
- 状态：冻结 ｜ 2026-07-24

## D-032 GitHub API 限流按 resource 分桶 + 禁持续指数重试
- **决策**：
  - 区分 `core` / `search` / `code_search` 三类独立配额（GitHub 匿名限额各不相同），按 `X-RateLimit-Resource` 头归桶。
  - 每桶读取 `X-RateLimit-Remaining` / `X-RateLimit-Reset` 与 `Retry-After` 头维护本地节流状态。
  - **命中限流（403/429 且 Remaining=0）时禁止持续指数重试**——静默等待到 Reset/Retry-After 时刻，期间同桶请求直接走降级。
  - 降级路径：`search` 受限 → 引导打开 GitHub 网页搜索或用本地 DOM 结果；`core` 受限 → 纯 DOM 解析 + 中文提示。
- **理由**：指数重试对配额型限流无效且加速封禁；search 匿名限额（10 次/分钟）远低于 core，必须分桶。
- 状态：冻结 ｜ 2026-07-24

## D-033 数据清除三分
- **决策**：Options 页提供三个**独立**清除操作：
  1. 清除会话/偏好（**不删除**任何 Provider Key）；
  2. 单独删除某 Provider 的 API Key（经 credential-store delete）；
  3. 经明确二次确认后清除**全部本地数据**（会话+偏好+全部凭据，弹窗说明内容与不可恢复性）。
  - 每种清除配套断言：目标数据无残留、非目标数据完好。
- **理由**：原"一键清"把 Key 与会话耦合，用户清会话会意外丢 Key，或想删 Key 却删不干净。
- 状态：冻结 ｜ 2026-07-24

## D-034 DeepSeek 模型策略（精确化 D-007 联网核实结论）
- **决策**：
  - **精确事实（联网核实 2026-07-24，来源：DeepSeek 官方 API Change Log）**：`deepseek-chat` 与 `deepseek-reasoner` 别名于 **2026-07-24 15:59 UTC 起完全停用**（此前过渡期分别映射到 `deepseek-v4-flash` 的非思考/思考模式）。**DeepSeek Provider 不得依赖这两个别名**。
  - DeepSeek 官方端点**推荐预填模型：`deepseek-v4-flash`**（成本低、速度快、简单 Agent 任务表现足够）；同时保留 **`deepseek-v4-pro`** 供复杂任务选择（模型下拉可选）。
  - **模型名不是冻结常量**：实际可用模型经 Provider 配置、模型列表接口（若端点提供 `/models`）或 Phase 4 能力探针确认；推荐模型不可用 → 提示用户改选其他模型，**不阻塞整个扩展**。
- 状态：冻结 ｜ 2026-07-24

## D-035 manifest 最低浏览器版本
- **决策**：manifest 声明 `"minimum_chrome_version": "114"`。
- **理由**：Side Panel API 需 Chrome ≥114；`storage.local.setAccessLevel` 需 ≥102，114 一并覆盖。声明后低版本浏览器直接拒装，避免运行时才发现 API 缺失。
- 状态：冻结 ｜ 2026-07-24

## D-036 Phase 0 截图换算与最小权限定稿
- **决策**：
  - 截图坐标使用 `scaleX = capturedWidth / viewport.cssWidth`、`scaleY = capturedHeight / viewport.cssHeight`，矩形各分量分别乘对应比例并四舍五入，随后 clamp 到截图边界。
  - `getBoundingClientRect()` 产生的视口坐标不扣 scroll、不做 GitHub 固定页头补偿。
  - v1 最终 API 权限为 `sidePanel` / `storage` / `activeTab`；不申请 `tabs` / `scripting` / `<all_urls>`。
- **实测证据**：Windows 1.5× DPI + Chrome 125% zoom + scrollY≈914 + Side Panel 开启，三个真实 GitHub 元素的预期/实测像素矩形完全一致；Content storage 访问被 TRUSTED_CONTEXTS 拒绝。详见 `scripts/probe-results.md`。
- 状态：已验证 ｜ 2026-07-24

## D-037 CRXJS/Vite 多入口 basename 唯一化
- **决策**：MV3 Background 与 Content 构建入口使用唯一 basename：`service-worker.ts` / `content-script.ts`；当前 CRXJS 2.7.1 + Vite 8.1.5 生产构建关闭 sourcemap。
- **理由**：实测两个入口都名为 `index.ts` 时，CRXJS 产物名碰撞会让 `service-worker-loader.js` 错误导入 Content bundle；开启 sourcemap 时 Content IIFE 尾部会被拼入 `sourceMappingURL` 行注释导致语法错误。唯一入口名与关闭 sourcemap 后，实际 loader、注入、SW 消息和截图链路全部通过。
- **范围**：仅构建兼容调整，不改变模块职责、权限、安全边界或 MVP。
- 状态：已验证 ｜ 2026-07-24

## D-038 OpenRouter 视觉 fallback
- **决策**：
  - OpenRouter 文本默认保留 `~openai/gpt-latest`；视觉默认/fallback 使用 `openrouter/free`。
  - 视觉探针先验证已配置型号；若报错或返回空内容，则尝试明确 fallback。fallback 通过后保存实际视觉型号，后续 Panel 不再继续使用已失败型号。
  - 视觉样例使用 `32×32` PNG，避免 `1×1` 图片造成端点兼容性假阴性。
- **实测证据**：第二轮 `~openai/gpt-latest` 视觉返回空内容；加入 fallback 后第三轮 OpenRouter 文本与视觉均在 Options UI 显示“已验证”。完整记录见 `scripts/provider-probe-report.md`。
- **范围**：Provider 内部模型路由与探针可靠性修正，不新增 Host、Chrome 权限、数据类型或 MVP 功能。
- 状态：已验证 ｜ 2026-07-24

## D-039 DeepSeek V4 默认使用非思考模式
- **决策**：
  - DeepSeek 适配器对 `deepseek-v4-flash` / `deepseek-v4-pro` 请求显式发送 `thinking: { type: "disabled" }`；v1 不把 Thinking 隐式作为默认能力。
  - Options 增加单 Provider 能力复测入口；指定单家时只调用该 Provider，并保留其他 Provider 已持久化的探针结果。
  - 若未来增加 Thinking 开关，须单独设计 reasoning 上下文续传、成本披露与安全展示；不得把 `reasoning_content` 当最终回答兜底。
- **理由**：DeepSeek 官方 V4 文档显示 Thinking 默认为 enabled，`max_tokens` 同时覆盖 reasoning 与最终回答。Phase 4 文本探针仅给 16 tokens，真实端点 HTTP 成功但最终 `content` 为空，与预算被默认 reasoning 消耗的行为一致。显式非思考模式既修正假阴性，也符合本项目“文本默认 DeepSeek、成本最低”的冻结路由原则。
- **证据**：适配器回归测试验证非流式/流式共用请求体覆写；Options/UI/消息路由测试验证 `providerId=deepseek` 的单家复测不会触发其他端点。第四轮真实单家复测中，DeepSeek 文本由“未验证/不可用”变为“已验证”。
- **范围**：Provider 内部请求参数与探针触发粒度调整；不新增 Host、Chrome 权限、数据类型或 MVP 功能。
- 状态：已验证 ｜ 2026-07-24

## D-040 Side Panel 产品入口、连接代际与输入语义
- **决策**：
  - 单击扩展 action 或执行 `Alt+Shift+G` 时，直接对当前标签调用 `chrome.sidePanel.open()`；Phase 0 技术探针不再复用产品打开入口，只能由明确探针消息触发。
  - Panel 的长连接回调与当前 React effect 代际绑定；effect 清理后到达的旧 `onDisconnect` 不得覆盖新连接状态。
  - 输入框默认 `Enter` 发送、`Shift+Enter` 换行；输入法正在合成字符（`isComposing`）时不拦截 Enter。
- **理由**：用户实测发现 action 点击未打开 Panel，且 React StrictMode 首次连接的延迟断开事件会把第二次有效连接误标为离线，造成已有输入时发送按钮仍为灰色。textarea 原生 Enter 只换行，也不符合对话工具的常用交互。
- **证据**：三个独立红测分别复现 action 未调用 `sidePanel.open`、StrictMode 旧连接覆盖新状态、Enter 不发送；修复后定向测试 8/8、全量 Vitest 22 files / 69 tests、typecheck、lint、build 与构建安全扫描全部通过。
- **范围**：仅修复现有 Side Panel 打开、连接与输入交互；不新增权限、Host、数据类型或 MVP 功能。
- 状态：已验证 ｜ 2026-07-24

## D-041 MV3 Port 断线自动恢复
- **决策**：
  - Panel 将 Background port 的 `onDisconnect` 视为可恢复状态，而不是会话终态；先标记离线，再自动建立新 port。
  - 重连从 250ms 开始指数退避，最高 5s；任一时刻只允许一个重连计时器。重连成功后归零退避次数，并由新 Service Worker 连接重新下发 Provider 状态。
  - Panel 主动卸载/关闭时停止计时器并禁止重连；旧 port 的延迟断开不得影响新 port。
  - 不用心跳请求强行常驻 Service Worker，继续服从 MV3 生命周期。
- **理由**：真实 DeepSeek 首轮流式回答成功后 Background 连接断开，Panel 仅变为离线且无法发送第二轮。MV3 Service Worker 可被回收，客户端必须把 port 当作可重建资源。
- **证据**：确定性生命周期红测复现“首轮发送→port 断开→永不重连”；修复后 250ms 建立第二个 port、第二轮发往新 port，主动关闭后 5s 内不再连接。全量 Vitest 23 files / 70 tests、typecheck、lint、build 与构建安全扫描通过。
- **范围**：仅增强现有 Panel↔Background 连接韧性；不新增权限、网络请求、Host、持久数据或 MVP 功能。
- 状态：已验证 ｜ 2026-07-24

## D-042 助手回答安全 Markdown/GFM 渲染
- **决策**：
  - 助手回答使用固定版本 `react-markdown@10.1.0` + `remark-gfm@4.0.1` 渲染标题、段落、列表、强调、引用、代码和表格；用户消息保持纯文本。
  - 禁用原始 HTML；图片不创建 `<img>`、只显示“远程图片已阻止”占位；链接不创建可点击 `<a>`、只显示带目标提示的文本。
  - 不引入 `rehype-raw`、远程脚本、远程样式或运行时 Markdown 代码执行。
- **理由**：真实 DeepSeek 回答包含 Markdown，但纯文本节点把 `**粗体**`、编号列表等原样显示，显著降低长回答可读性。模型输出仍是不可信数据，渲染不能产生脚本、隐式图片请求或绕过导航确认的外链。
- **证据**：组件红测先复现纯文本输出；修复后语义化 heading/list/strong 渲染通过，同时断言无 `script` / `img` / `a`。依赖锁文件通过供应链策略检查；全量 Vitest 23 files / 71 tests、typecheck、lint、build 与构建安全扫描通过。
- **范围**：仅改变助手消息的本地展示；不新增 Chrome 权限、网络 Host、出站数据或模型请求。
- 状态：代码已验证 ｜ 2026-07-24

## D-043 会话集合、页面关联与有限历史
- **决策**：
  - Background 以版本化 `sessions:v1` 集合独占会话持久化；Panel 不直接读写会话，只接收经 zod 校验的 `SESSION_STATE` 投影。
  - 当前 URL 精确匹配优先；同仓库 SPA/页面切换继续最近会话并更新 `pageUrl/pageType`；跨仓库自动隔离为新会话。此规则消解 ARCHITECTURE 3.6 与 3.10 对“同仓库但页面类型变化”的歧义，以 repository 作为会话关联主边界。
  - 消息数 >40 或估算 token >8k 时，在本地生成提取式 `historySummary` 并保留最近消息，不为摘要额外调用付费 Provider。单条消息 16KB、Provider 历史窗口 12KB、Panel 恢复投影 48KB，出站总上下文继续受 ContextBuilder 32KB 上限控制。
- **理由**：MV3 Service Worker 不常驻，单一版本化集合便于原子恢复、过期和确定性淘汰；本地摘要避免隐藏成本，三个独立载荷边界同时防止无限历史出站和再次触发 64KB 消息上限。
- **证据**：单元/集成测试覆盖 CRUD、同仓库关联、30 天过期、最近 50 个、摘要触发、容量淘汰、Panel 恢复和回答完成持久化。
- **范围**：Phase 5 内部持久化与上下文实现；不改变 MVP、Provider、Host、Chrome 权限或数据出站边界。
- 状态：代码已验证 ｜ 2026-07-24

## D-044 偏好运行时约束与全清内存复位
- **决策**：
  - `preferences:v1` 读写均经 zod 严格校验；`downloads` 只允许 `confirm|deny`，`accountChanges` 只允许字面量 `deny`，非法持久数据回退安全默认值，非法写入直接拒绝。
  - D-033“清除全部本地数据”先经 credential-store 批量删除三个 Provider Key，再清空其余 local storage；随后通知 Background 清除内存中的探针、禁用状态和手动路由。
- **理由**：TypeScript 类型不能保护损坏或手工篡改的浏览器存储；全清若只删磁盘而保留 Service Worker 内存状态，重新录入 Key 后可能错误沿用旧能力结论。
- **证据**：测试断言非法 operationPolicy 被拒；会话/偏好清除后 Key 与配置完好；单 Key 删除不影响其他数据；全清无存储残留且 ProviderManager 回到未探针状态。
- **范围**：Phase 5 偏好/清除安全收口；不扩大权限或清除范围。
- 状态：代码已验证 ｜ 2026-07-24

## D-045 点击选择事件边界与 SPA 失效
- **决策**：
  - Content `PickController` 在捕获阶段监听 pointermove/click/keydown；高亮叠层 `pointer-events:none`，只有用户完成选择时才 `preventDefault` 并停止原页面点击。Escape、Panel 取消、SPA 失效或 Panel 断开均退出并清理。
  - 嵌套节点归一到最近的链接、按钮或表单控件；SelectedElement 只保留 allowlist 属性，password input 不读取 value。
  - SelectedElement 附带 `sourceUrl`；Background 在每次提问时重读当前 PageInfo，URL 不一致就丢弃旧选择并通知 Panel，不把旧页面内容发给 Provider。
  - 选择数据全程经固定 envelope、request ID 与 zod；ContextBuilder 将其放在带不可信标记的 user 页面上下文中，绝不进入 System Prompt。
- **理由**：捕获阶段能在 GitHub 自身 handler 前稳定截获一次明确用户手势；逻辑元素归一比内部 span/svg 更可解释。SPA 后 Panel 可能仍持有已选对象，发送前 URL 二次校验是必要的零信任边界。
- **证据**：测试覆盖叠层定位、点击阻断、Escape/外部取消、SelectedElement 完整结构、password 值排除、Panel 状态与消息提交、Background 状态推进、ContextBuilder 隔离及 SPA 旧选择不出站；全量 95 项测试通过。
- **范围**：Phase 6 冻结核心功能的内部实现；不新增 Chrome 权限、Host、持久化敏感数据或写操作。
- 状态：代码已验证 ｜ 2026-07-24

## D-046 区域结构充分性与可信截图预算
- **决策**：
  - Content 与 Background 共用确定性结构充分性规则：提取文字 ≥80 字符、任一代码块 ≥8 字符、或链接+按钮 ≥2，满足任一即只发结构化文本；否则 `needsVision=true`。消息 zod 校验布尔值与内容一致，防止意外触发或跳过付费视觉。
  - Content 只上报结构、视口矩形、viewport/scroll/dpr/zoom 与 `sourceUrl`；Background 截图前重新校验活动 GitHub tab URL，使用 D-036 比例法换算且不扣 scroll。
  - 裁剪最长边限制 1600px，输出临时 JPEG，压缩数据目标约 1MB；Provider transport 仍保留 2MB 请求硬上限。bitmap 在 finally 关闭，截图不进入 storage、Session、Panel 消息或日志。
  - `visionEnabled=false` 在 Session 写入、截图和 Provider 请求前拒绝；结构不足时 Panel 在发送前显示“视觉 Provider + 可能费用”，用户的发送动作才授权本轮截图与视觉请求。
- **理由**：结构化优先可减少成本与隐私暴露；统一函数和 Schema 一致性避免 Content/Panel 状态漂移造成隐藏视觉请求。1MB 图像预算为 base64 膨胀和 32KB 文本上下文预留空间。
- **证据**：测试覆盖 drag/反向坐标、结构化六类字段、充分/不足判定、needsVision 篡改拒绝、Phase 0 坐标比例、越界/取消、bitmap 关闭、零截图文本路径、视觉图像注入、偏好关闭前置阻断与 Panel 费用提示；全量 107 项测试通过。
- **范围**：Phase 7 冻结核心功能的内部实现；不新增 Chrome 权限、Host、持久数据类别或后台截图能力范围。
- 状态：代码已验证 ｜ 2026-07-24

## D-047 中文搜索采用确定性本地转换与持久化分桶
- **决策**：
  - Phase 8 中文搜索先用本地确定性转换器把自然语言编译为 GitHub query；支持 `language/stars/topic/repo/is/label/pushed/archived` 等 MVP 限定词，并保留严格只读的转换 Prompt 契约供未来扩展。当前搜索不调用 AI Provider，不产生隐藏模型费用。
  - `searchRepos/searchIssues` 作为只读工具经 zod 严格参数校验，只访问固定 `https://api.github.com/search/repositories|issues`；响应投影和 Panel 消息均限制字段、条数与长度。
  - `core/search/code_search` 桶状态写入 `github:rate-limits:v1`，使 MV3 Service Worker 回收后仍能遵守 Reset/Retry-After。403/429 且 Remaining=0 后同桶请求直接降级，不做指数或即时重试；到点删除阻断并允许一次新请求。相同查询 60 秒内使用内存缓存。
  - search 降级最多展示 10 条当前 GitHub 搜索页本地 DOM 文本，并生成经共享 Schema 验证的 `https://github.com/search` URL；所有结果打开动作走 Panel→Background 安全路由。
- **理由**：常见中文搜索条件可确定性转换，能降低 Provider 成本与结果漂移；限流状态持久化符合 MV3 非常驻现实；固定 API/网页 URL 与有限投影避免把远端结果变成任意导航或大载荷通道。
- **证据**：7 组转换测试含 5 组代表性中文查询；API 测试覆盖仓库/Issue 投影、三桶独立、Remaining/Reset/Retry-After、限流零重试、到点恢复与缓存；工具、集成和 UI 测试覆盖白名单、Schema、解释、结果卡及网页/DOM 降级。全量 126 项测试通过。
- **范围**：Phase 8 冻结核心功能的内部实现；不新增 Provider 调用、GitHub Token、Chrome 权限、Host、写操作或外部导航能力。
- 状态：代码已验证 ｜ 2026-07-24

## D-048 仓库分析采用事实层与解释层分离
- **决策**：
  - `RepositoryAnalysisCard` 为固定本地 Schema。Star/Fork/Watch、Release、日期、归档、许可证、Issue/PR 与语言比例属于**事实层**，只能由公开 DOM/匿名 GitHub API 写入；Provider 只生成用途、平台、安装建议、难度、风险与下一步，最终组装时不能覆盖事实字段。
  - core 聚合固定访问仓库详情、languages、latest release、open pulls；`open_issues_count - openPullRequests` 得到开放 Issue。完整结果内存缓存 5 分钟；部分失败保留已取得事实，限流缓存不超过 retryAt，core 阻断时直接使用 DOM。
  - README 提取到的安装命令优先于 Provider；缺字段保留固定卡片并显示“未获取/未知”，不让模型补造。API 重定向时以 `full_name/html_url` 作为 canonical 仓库身份。
  - Provider 已验证 structured output 时请求 `json_object`；未验证时使用严格 Prompt + 本地 zod。仅 Schema 不合法时再尝试一次；网络、鉴权、限流等 Provider 错误不自动重复调用，随后由上层生成本地确定性说明。
- **理由**：可变事实必须可追溯，模型适合解释而不适合作为数字来源；分层组装既保留 AI 的中文可读性，也让 Provider 失败、缺字段和限流时仍能生成有边界的卡片。
- **证据**：单元/集成/UI 测试覆盖三仓库固定快照、事实回填、README 安装优先、缺字段、core 限流零重试、Provider structured/prompt 两路、非法 JSON 单次重试、网络错误零重试、私有页面零出站、canonical 重定向和卡片渲染。匿名真实测试 `react/react`、`microsoft/vscode`、`rust-lang/rust` 全部通过，见 `scripts/phase9-live-evidence.md`。
- **范围**：Phase 9 既定功能的内部实现；不新增 GitHub Token、Host、Chrome 权限、写操作或持久页面内容。
- 状态：代码与真实匿名 API 已验证 ｜ 2026-07-24

## D-049 安全策略集中到脱敏、消息与工具三个执行 seam
- **决策**：
  - `sanitizer` 扩展为字符串模式与结构化敏感键名双层遮蔽，覆盖常见 API/GitHub/云密钥、Authorization、JWT、URL 凭据、私钥、env、Cookie/密码与 PII；循环对象安全终止，发现类型按类别汇总。消息 Router 复用相同敏感键名判定，普通消息中的嵌套凭据字段在 handler 前拒绝。
  - 全部冻结只读工具统一进入 `ToolRegistry`：工具名白名单、每工具 strict zod Schema、执行器注册和确认策略在同一 seam 完成。`SearchToolRegistry` 仅开放搜索子集；GitHub 导航精确限制为 HTTPS `github.com`，外链必须为不含 URL userinfo 的 HTTPS 且逐次确认；写操作、账号操作和下载工具不注册。
  - 普通对话、搜索、仓库分析在 `PanelBridge` 取得 PageContext 后立即执行私有/无权限阻断，使 Provider、GitHub API、会话准备和截图在私有页均为零调用。
  - Prompt Injection 红队使用 12 个页面载体与确定性恶意工具输出样例，按“假设模型已经受诱导”的最坏情况验证执行层。为避免新增付费成本，本阶段不调用真实 Provider；记录明确不把机制测试表述为模型绝对免疫。
- **理由**：少量公共 seam 能让所有调用方共享同一安全策略，避免字符串脱敏、消息拒绝和工具执行各自维护相互漂移的名单；最坏输出验证比依赖某次模型“没有服从”更稳定地证明执行层护栏。
- **证据**：`tests/security/` 覆盖脱敏后实际 Provider 请求体、日志、私有页三条出口、完整工具白名单、Scheme/Host/userinfo/strict 参数、逐次确认与 12 个注入样例；`tests/security/redteam-log.md` 记录逐项结果与结论边界。全量 186 项常规测试通过（另 1 个 Phase 9 live test 默认跳过），typecheck、lint、build 与构建安全扫描通过。
- **范围**：Phase 10 后期安全加固；不新增 Chrome 权限、Host、外部调用、真实 Provider 成本、GitHub 写操作或数据类别。
- 状态：代码已验证 ｜ 2026-07-24

## D-050 Phase 11 浏览器验收采用隔离 fixture E2E 与可校验本地包
- **决策**：
  - Playwright E2E 加载真实 `dist` MV3 扩展和项目锁定的 Chrome for Testing，临时 profile 仅位于 Git 忽略的 `probe-artifacts/`。`github.com` 与 `api.github.com` 请求在浏览器上下文中用固定 fixture 响应，确保不依赖账号、实时网络或匿名限额，也不调用 AI Provider。
  - Options 页真实用户点击必须先成功执行 `chrome.sidePanel.open()`。因当前 Chrome for Testing 不把原生 Side Panel target 暴露为 Playwright `Page`，自动 DOM 断言使用同一扩展进程的 Panel 文档；Background/Content/storage/消息链与生产 bundle 不替换。原生 Side Panel 交互保留给唯一人工批量复核。
  - E2E 覆盖仓库分析卡的 API 事实、SPA 导航后 PageContext 刷新、Content 单实例标记、会话持久化与 Panel 重载恢复；测试固定断言 Provider 请求为 0。
  - `package-extension.ps1` 只归档 `dist/` 内容到 Git 忽略的 `artifacts/`，校验 zip 根目录 `manifest.json`、条目数与 SHA-256；产物仅供本地加载/交付，不构成发布。
- **理由**：fixture E2E 在不泄漏凭据、不产生费用、不受 GitHub 页面漂移影响的前提下验证真实扩展运行链；原生 Side Panel 自动化边界被明确记录而非伪装为已覆盖。
- **证据**：`pnpm test:e2e` 输出 `status=passed`、`nativeSidePanelOpenResolved=true`、仓库分析/SPA/会话恢复全部通过、`providerRequests=0`、`pageErrors=[]`；`pnpm package:extension` 校验 13 个归档条目。
- **范围**：Phase 11 测试、打包与使用说明；不新增产品权限、运行时 Host、远程发布或 Provider 调用。
- 状态：自动验收已验证，待人工批量体验复核 ｜ 2026-07-24

## D-051 对话问题在 Session 与 Provider seam 之前统一脱敏
- **决策**：`PanelBridge` 校验 `PANEL_MESSAGE` 后立即对用户问题执行一次 `sanitizeText`；SessionStore 准备/持久化、Panel 会话快照和 Provider runtime 都只接收脱敏结果。Panel 的乐观原文状态随后由 Background 返回的脱敏 Session 快照替换。
- **理由**：ContextBuilder 原本能保证 Provider 请求体脱敏，但 SessionStore 位于其之前；用户若误把凭据粘进提问，原文可能进入本地持久化。把脱敏前移到消息桥公共 seam，可同时保护持久化和出站，而不让 SessionStore 导入 Provider/凭据逻辑。
- **证据**：安全测试从 `PanelBridge.dispatch` 验证 Session question、Provider question 与回推状态均无假 Key 明文；Playwright E2E 发送假 Key 后，`chrome.storage.local` 和 Panel 重载结果均只有 `‹REDACTED:API_KEY›`。
- **范围**：Phase 11 发布前安全审查补丁；不改变用户可用功能、权限、Host、Provider 路由或数据类别。
- 状态：代码与浏览器 E2E 已验证 ｜ 2026-07-24

## D-052 Phase 11 人工复核补丁统一问答状态与紧凑交互
- **决策**：
  - System Prompt 增加回答风格契约：结论先行、只保留必要依据，普通回答默认控制在 400 个中文字符内；复杂任务最多 6 个短要点，用户明确要求教程、详细解释或完整代码时才展开。禁止寒暄、复述问题、重复结论、泛化总结与礼貌收尾，但准确性和必要不确定性说明优先。
  - 分析区与问答区都可独立收起/展开。点击/框选成功后，Panel 显示明确的“下一步：输入问题”操作，展开问答并聚焦输入框。
  - Panel 提供最近 10 个会话的有界最小目录与“新建会话”。目录只含 ID、短标题、短仓库标识、更新时间和消息数，不携带页面 URL 或正文。默认继续当前活动会话；用户显式选择时允许跨 GitHub 页面继续该会话，显式新建则不复用同页旧会话。
  - 当前活动会话 ID 仅以版本化指针存入 `chrome.storage.session`。Background 重连或 GitHub 页面切换产生的 `hydrate` 快照不得用空会话或其他自动匹配会话覆盖 Panel 当前对话；完整 Panel 重载则由活动指针恢复。清除会话/偏好或清除全部数据时同步清除该指针。
  - Markdown fenced code 始终按独立深色代码块渲染；行内代码继续使用浅色样式，避免二者的前景色/背景色冲突。
- **理由**：人工复核暴露的五个问题来自同一交互状态边界：回复过长、长区块占位、选区没有动作闭环、代码块样式冲突，以及页面上下文更新误覆盖对话。把活动会话选择与页面上下文刷新分离，可在不扩大持久数据、权限或 Provider 调用范围的前提下稳定用户控制权。
- **证据**：新增/扩展 ContextBuilder、Markdown、Phase 5/6/7/9 UI、Panel connection/roundtrip、SessionStore 与 active-session-store 测试；隔离 Chrome E2E 在 GitHub SPA 切换后重载 Panel，`survivedPageSwitch=true`。全量 195 项常规测试通过（另 1 项 live test 默认跳过），typecheck、lint、build 与构建安全扫描通过。
- **范围**：Phase 11 人工复核内部补丁；不新增 Chrome 权限、Host、Provider 成本、GitHub 写操作或持久数据类别。
- 状态：代码与浏览器 E2E 已验证，待人工复核 ｜ 2026-07-27

## D-053 仓库分析以受限文件证据为主，问答与会话删除逐次确认
- **决策**：
  - 一键分析除原有 API 事实外，使用固定 `api.github.com/repos/{owner}/{repo}/contents` 路径读取根目录、最多 2 个高信号源码目录，并从中选择最多 3 个清单/入口/源码文件。候选文件 API 大小必须 ≤24KB，只解码前 4KB 文本；锁文件、测试/文档/依赖目录和不安全路径不读取，原始片段不持久化。卡片先展示目录、文件路径、角色与确定性内容线索；语言比例降为最多 5 项的次要信息。
  - 关键文件片段经 sanitizer 后，只作为明确标记的不可信 user 数据交给 Provider；System Prompt 要求用途、入口、安装与难度优先基于实际检查的文件证据，不能只复述仓库简介。私有/无权限页仍在任何 GitHub API 或 Provider 请求前零出站。
  - Panel 按用户消息把后续 assistant 消息组成一轮问答。问题左侧 `>`/`∨` 只控制该轮回复显隐；回复右侧垃圾桶先展开 `✓`/`×`，仅 `✓` 发送删除。Background 按 user message ID 删除该问题及下一个用户问题前的回复，不影响相邻轮次。
  - 最近会话目录使用同样的垃圾桶与 `✓`/`×` 二次确认；删除只作用于本地 `sessions:v1`。删除活动会话时同步清除 `storage.session` 活动指针并进入新会话；生成中禁用删除。
- **理由**：仓库语言和热度元数据不能回答“项目实际如何组成与运行”，而全仓库下载又超出数据最小化和匿名配额边界；少量高信号文件提供可核查证据。逐轮收展与逐次确认删除则在节省空间的同时避免误删整个上下文。
- **证据**：GitHub API、确定性摘要、Provider Prompt、卡片 UI、SessionStore、Panel 协议/连接/往返与 Phase 5 UI 测试覆盖受限源码目录、锁文件/路径穿越拒绝、相邻轮次不误删、收展隔离和两级确认；隔离 Chrome E2E 断言 `package.json` 与 `src/server.js` 文件证据且 Provider 请求为 0。
- **范围**：Phase 11 第二轮人工复核内部补丁；不新增 Chrome 权限、Host、GitHub Token/写操作、Provider 调用次数或持久数据类别。
- 状态：代码与浏览器 E2E 已验证，待人工复核 ｜ 2026-07-27

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

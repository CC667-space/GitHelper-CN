# PROJECT_BASELINE.md — 项目冻结基线（最高级约束）

> 本文件是全项目的**单一事实来源与最高约束**。任何执行阶段不得静默违反本文件。
> 修改本文件 = 基线变更，必须由项目负责人（下称"你"）确认。
> 状态：**已冻结 v1.5** ｜ 初次冻结：2026-07-23 ｜ 修订：2026-08-21（v1.1–v1.5 定向修订，见文末变更记录）

---

## 0. 一句话定位

一个面向**中文 GitHub 新手**的 Chrome 浏览器 AI 助手（Manifest V3 + Side Panel）。它就地理解当前 GitHub 页面、用中文解释你点击或框选的内容、把自然语言转成 GitHub 搜索，并在受控范围内辅助导航与信息查询——让你不必系统学习 GitHub 术语、也不必反复截图转发给别的 AI。

**建议项目名**：`GitHelper-CN`（npm 包名/代号 `git-helper-cn`，仅指扩展包标识，不是目录名）。最终名可后续调整，不影响执行。

---

## 0.5 唯一工作根目录（冻结）

- **唯一项目根目录 = 唯一本地 Git 仓库根目录 = `C:\AI_GitHelper-CN`**。
- **禁止**在其下再建任何"嵌套项目根"（不得出现二级 `AI_GitHelper-CN/`、`project/`、`app/` 之类的再包一层）。
- 源代码、测试、脚本、构建产物直接放该根目录下的子目录：`src/`、`tests/`、`scripts/`、`dist/`。
- 原始需求 Prompt `Claude_Prompt.md` 仅供历史追溯，**移动到 `references/Claude_Prompt.md`**，**不是权威执行文件**。
- **权威冲突裁决顺序**（发生任何冲突时，从高到低）：
  `PROJECT_BASELINE.md` → `AGENTS.md` → `SECURITY.md` → `EXECUTION_PLAN.md` → `ACCEPTANCE.md` → 其他文档 → `references/Claude_Prompt.md`（最低，仅追溯）。

---

## 1. 项目目标

消除普通中文用户 / 编程初学者使用 GitHub 的五类摩擦，把 AI 变成 GitHub 页面上的：
1. 中文解释层
2. 新手导航层
3. 搜索转换层
4. 页面理解层
5. 受控操作辅助层

---

## 2. 目标用户

- **第一版（v1）**：你本人 + 能自行填写 API Key 的少量中文 GitHub 新手（BYOK 原型）。
- **非目标用户（v1 不服务）**：零配置的纯小白（需要托管代理/账号系统，留待后续）。

---

## 3. MVP 功能范围（v1 必须实现）

1. GitHub 页面上的 Side Panel 主界面
2. 当前页面上下文读取（DOM 优先）
3. 中文自然语言对话
4. 点击元素提问
5. 框选区域提问
6. 必要时调用视觉模型（结构化信息不足才截局部图）
7. 自然语言 → GitHub 搜索
8. 一键当前仓库分析
9. Session 本地保存与恢复
10. 少量用户偏好（语言 / 技术水平 / 操作系统 / 操作策略）
11. 至少一个可用文本 AI Provider + 一个可用视觉 Provider
12. 数据清除（v1.2 明确三种独立操作，D-033）：① 清除会话/偏好（**不删除** API Key）；② 单独删除某 Provider 的 API Key；③ 经明确确认后清除**全部本地数据**（会话+偏好+全部凭据）
13. 基础安全与隐私保护（数据最小化 + 敏感信息遮蔽 + Prompt Injection 防护）
14. 可加载、可演示、可测试的本地扩展包（开发者模式）

### 适配的 GitHub 页面（v1）
仓库主页 / README / Issues（列表+详情）/ PR（列表+详情）/ Releases / 单文件代码浏览 / 搜索结果页。
Discussions / Projects / Gist / Actions 详情：v1 仅"能读基本信息"，不做深度适配。

---

## 4. 明确非目标（v1 绝不实现）

- ChatGPT 账号登录 / ChatGPT Plus / ChatGPT Memory / 依赖 ChatGPT App
- 云端同步 / 多用户账号系统 / 商业计费
- Chrome Web Store 正式上架
- 自动评论 / 自动创建 Issue / 自动创建 PR / 自动 Fork / 任何 GitHub 写操作
- 自动下载并运行文件
- 任意网页控制 / 自由坐标模拟点击 / 通用浏览器自动化 Agent
- 扩展到 GitHub 以外的网站
- 大规模多 Agent 系统 / 后台管理平台 / 完整 IDE / 代码自动开发平台

---

## 5. 技术路线（已冻结）

- **平台**：Chrome Manifest V3（主测试目标 Chrome；保持 MV3 通用，Edge 理论可装但不做专项测试）
- **语言**：TypeScript
- **主界面**：Side Panel API
- **页面读取**：Content Script（DOM 解析 + 选择/框选能力）
- **中枢**：Background Service Worker（生命周期、消息路由、网络调用）
- **设置页**：Options 页管理 Provider / API Key / 偏好
- **总原则（技术铁律，不可违反）**：
  > **DOM 优先 → GitHub API 第二 → 视觉补充 → 模拟点击最后。**
- UI 框架、构建工具、状态管理、测试框架等普通选型见 `DECISIONS.md`，执行阶段不再重开。

---

## 6. AI 接入路线（已冻结，v1.4 修订）

- **BYOK**：用户自行提供 API Key，扩展**直接调用** AI API，v1 不做本地/远程代理（架构预留迁移空间）。
- **Provider 目录（D-020 / D-063 / D-068）**：常用候选包括 DeepSeek / OpenRouter / OpenAI / Anthropic / Google Gemini / 阿里云百炼 Qwen / SiliconFlow / GLM / Kimi / Grok，以及一个用户显式配置的 OpenAI-compatible 自定 Provider。GLM / Kimi / Grok 使用各自预定义官方 HTTPS Host；UUAPI 仅保留旧配置兼容，不再出现在新选择器中。
- **自定 Provider（D-068）**：用户可填写一个 HTTPS API Base URL 或完整 `chat/completions` URL、独立 Key 与文本/视觉 Model ID。拒绝 URL 凭据、query/fragment、非默认端口、localhost、私网/回环/链路本地/保留地址字面量和跨 origin 重定向。manifest 的 `https://*/*` 只是未授予的可选 Host 候选范围；保存时仅申请经校验的精确 Host，Background 请求前再次核对配置、权限与实际请求 origin。Content/Panel 不得提供任意 fetch URL。
- **无密钥设置 JSON（D-063 / D-068）**：允许导入/导出 Provider model 绑定及 custom 的非秘密 URL 配置；严禁包含 API Key、Authorization、token 或其他凭据。内置 Provider 的 Host/endpoint 仍不可修改，JSON 不能创建白名单外 Provider。
- **统一适配器 + 能力模型**：Provider 抽象走 OpenAI 兼容 `chat/completions`，但每个 Provider 必须声明显式 **Capability 模型**（streaming/vision/toolCalls/structuredOutput/usage/abort 等），未经能力探针验证的能力不得当作既定事实（D-021）。
- **Provider 路由与模型策略（v1.2 修订，D-034；基于 2026-07-24 联网核实）**：
  - **文本默认：DeepSeek**（成本最低）。**关键事实**：`deepseek-chat` / `deepseek-reasoner` 两个别名于 **2026-07-24 15:59 UTC 起完全停用**（官方 Change Log），此后请求即报错。**DeepSeek Provider 不得依赖这两个别名**。
  - DeepSeek 官方端点推荐预填模型：**`deepseek-v4-flash`**（成本/速度/简单 Agent 任务表现均衡）；保留 **`deepseek-v4-pro`** 供复杂任务选择。**模型名不是冻结常量**——实际可用模型经 Provider 配置、模型列表接口（若可用）或能力探针确认；推荐模型不可用时提示用户改选其他模型，**不得阻塞整个扩展**。
  - **视觉默认与兜底：OpenRouter**。UUAPI 仅保留旧配置兼容，不参与新的默认路由或选择器。
  - OpenAI、Anthropic、Gemini、Qwen、SiliconFlow 是可选路线，不因加入目录而自动获得可用状态；具体文本/视觉能力必须由该 Key、该 model 的真实探针确认。
  - **关键约束**：**DeepSeek API 目前不支持图像输入**。视觉请求只能路由到已配置且真实探针确认支持图像的 Provider。文本/视觉 Provider 可分别配置，Side Panel 支持手动切换（手动优先）。
- **可用性判定（D-031 / D-063 / D-068）**：已完成的 v1 MVP 门槛不因目录扩展重新打开。Phase 12 新增路线必须通过 Mock、安全和权限测试；真实能力仍只认实际探针。单个外部 Provider 探针失败只记录并禁用；**所有**现有文本路线或**所有**现有视觉路线均失败才暂停。
- **数据流向的准确表述**：API Key 与请求数据（问题、必要上下文、选中内容）**仅发送到用户明确选择并授权的 API 端点**；旧 UUAPI、OpenRouter、SiliconFlow 和用户选择的 custom 服务可能将数据转交其上游模型供应商。**本扩展无法控制第三方端点后续如何处理数据**。设置页须展示：当前 Provider / API Host / 模型 / 数据将发往哪里 / 是否中转聚合 / 兼容层或共享端点提示。
- 视觉调用前提示"将消耗视觉额度"，设置可全局关闭视觉。

---

## 7. 数据与记忆路线（已冻结）

- **临时页面上下文**：不落库，随页面变化重建。
- **会话数据**：本地存储，默认保留 **30 天**，可一键清除；支持新建/继续/最近/删除/页面关联/长对话摘要/上下文长度控制。
- **长期偏好**：只保存用户**明确设置**的少量项；AI 推测默认**不写入**长期记忆；可查看/修改/删除。
- 不把模型自身上下文当可靠数据库；不把完整聊天永久保存为"用户画像"。

---

## 8. 隐私边界（已冻结，v1.1 修订）

- **数据最小化**：默认**绝不整页发送**。每次仅发送：用户问题 + 页面元数据（URL/页面类型/仓库名/编号）+ 用户选中/框选内容 + 相关局部上下文 + 必要摘要 + 最近有限轮对话 + 必要偏好。
- **私有仓库（v1.1 收紧，D-022）**：v1 **完全不支持**私有仓库。检测到私有仓库或无权限页面时，直接提示"不在当前版本支持范围内"，**零出站**。不提供"允许私有仓库"开关；私有仓库支持若未来需要，作为独立基线变更评估。
- **GitHub Token（v1.1 移除，D-022）**：v1 **不保存、不使用任何 GitHub Token**。仅用公开 DOM + 匿名 GitHub API + 缓存 + 按 Rate Limit 响应头节流降级。只有真实测试证明匿名限额阻塞 MVP，才另立决策评估细粒度 Token。
- **敏感信息遮蔽**：发送前本地检测并遮蔽 API Key / GitHub Token / Cookie / 密码 / 私钥 / `.env` 内容 / PII。
- **API Key 存储与可访问范围（v1.2 细化，D-009R / D-028）**：
  - Key 存 `chrome.storage.local`，扩展初始化即调用 `chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'})`，仅可信扩展上下文（Background / Side Panel / Options）可访问。
  - **录入与保存路径（D-028）**：Key 仅在 Options 页用户主动录入的 `password` 输入框中**短暂存在**，保存成功后立即清空输入框；`credential-store` 为仅可信上下文可导入的共享模块——**Options 只 write/delete，Background 只 read/inject**；Content Script 禁止导入（TRUSTED_CONTEXTS + lint/import 边界双重保护）。
  - **已保存的明文不得回显**（UI 只显示尾 4 位掩码），不得进入：Zustand 普通状态、Session 数据、对话记录、日志、导出文件、错误详情、普通消息载荷。
  - **Content Script 不得读取、接收、转发、持有任何 Provider 凭据**。
  - 明示：浏览器本地存储**不是加密保险箱**；BYOK 仅适用于个人原型；建议使用专用、可撤销、设了额度上限的 Key。
  - 数据流向表述以第 6 节"数据流向的准确表述"为准（Key 会发送到用户选择的 API 端点，这是 BYOK 的必然行为）。
- **Prompt Injection**：GitHub 页面全部文本（README/Issue/代码注释/UGC）视为**不可信数据**，不得覆盖系统规则、不得当作系统命令执行。

---

## 9. 操作权限边界（已冻结，v1.1 修订）

- **自动执行**：页面导航 / 公开搜索 / 信息提取。
- **需用户逐次确认**：下载、跳转外部可执行文件。**确认弹窗不得提供"始终允许该类操作"**——高风险权限不能一次点击永久放开（C-3）。
- **直接拒绝（deny）**：账号相关变更。v1 不实现任何账号写入操作，`accountChanges` 固定为 `deny`，不可配置为自动。
- **v1 禁止**：一切 GitHub 写操作（评论/PR/fork/star 等）、自由坐标点击、任意网页控制。
- 工具必须白名单化、参数可验证（见 `ARCHITECTURE.md` 工具设计）。

---

## 10. 发布范围（已冻结）

- v1 **不上架** Chrome Web Store；该路线继续暂停，不属于 GitHub Release。
- 经项目负责人 2026-08-21 明确授权，v1 可在既有公开仓库发布版本化 GitHub Release。安装资产为根目录含 `manifest.json` 的 ZIP 与对应 SHA-256 校验文件；用户解压后通过 Chrome 开发者模式“加载已解压的扩展程序”。不得把它描述为稳定版 Chrome 可一键安装的 CRX。
- 保持 MV3 通用；Chrome 为唯一主测试目标。
- 后续新版本 Release、Chrome Web Store 上架、其他商店或新的公开发布渠道仍是独立确认节点；本次授权只覆盖 Phase 14 的 GitHub Release `v0.1.0`。

---

## 11. 成功标准（v1 验收总纲）

在你本机 Chrome 加载扩展后，能稳定完成以下闭环，且每条有自动化测试或明确演示证据：
1. 打开任意公开仓库 → 一键分析 → 输出结构化中文结论
2. 点击 / 框选页面元素提问 → 得到合理中文解释
3. 输入中文自然语言 → 转成 GitHub 搜索 → 返回结果
4. 会话可保存并恢复
5. 敏感信息在发送前被检测并遮蔽，不被误发

详细客观标准见 `ACCEPTANCE.md`。

---

## 12. 关键假设

- 运行环境：Windows 11 + VS Code + PowerShell + Node.js LTS + pnpm。
- 你能运行命令、复制报错、协助手工体验验收，但不逐行手写全部代码。
- 你已持有部分 Provider Key；新增 GLM/Kimi/Grok/custom 不假设已有 Key，也不要求为了自动验收而购买或填写。
- GitHub 前端为 SPA，页面切换不整页刷新；MV3 Service Worker 会被浏览器随时休眠。
- GitHub 匿名 API 限额按 resource 分桶（core 60 次/小时；search 独立且更低，D-032）；v1 仅匿名 + 缓存 + 分桶节流降级（不用 Token，见 D-022）。

---

## 13. 已由我（架构师）代为作出的决策（摘要，详见 DECISIONS.md）

- 普通技术选型（UI/构建/状态/测试/目录/日志/依赖）全部代定，执行阶段不再询问。
- Provider 路由：文本 DeepSeek 默认、视觉/兜底 OpenRouter；十家常用内置候选 + 一个受限 custom + Capability 探针 + 手动切换优先；UUAPI 仅保留兼容。
- GitHub API：v1 仅匿名 + 缓存 + Rate Limit 节流降级，不引入 Token（D-022）。
- Git 治理：本地 Git 仓库 + 阶段提交 + 回滚规则（D-023，详见 AGENTS.md / EXECUTION_PLAN.md）。

---

## 14. 仍需未来特定阶段确认的事项（强制确认节点，见 EXECUTION_PLAN 与 AGENTS）

- 首次填入任何真实 API Key（凭据）
- 任何会产生新增付费成本的选择
- 扩大到 D-068 已授权固定 Provider 与受限 custom 规则之外的 Chrome Host 权限，或放宽 custom URL/精确授权边界
- 发送敏感数据 / 不可逆数据删除
- 新增 Git Remote / Force Push / 新建远程仓库 / Chrome Web Store 上架 / Phase 14 `v0.1.0` 之外的公开发布；Phase 14 所需的既有 `origin` Push、tag 与 GitHub Release 已获本轮定向授权
- 若匿名 GitHub API 限额被证实阻塞 MVP → 评估引入细粒度 Token（基线变更）
- 若未来需要私有仓库支持 → 独立基线变更评估
- 出现与本基线实质冲突、或多方向抉择无法按既有原则代决

---

## 15. 基线冻结后的禁止事项

- 不得静默改变产品目标 / 定位 / 重心
- 不得无理由扩大 MVP
- 不得因某技术"更有趣"而偏移
- 不得把通用浏览器 Agent / 云端平台 / 完整账号系统提前塞进 v1
- 不得在执行阶段重开已冻结的普通技术决策
- 不得复制或衍生第二套权威规划文件（权威文件只有根目录这一套）

---

## 16. 变更记录

- **v1.0（2026-07-23）**：初次冻结。
- **v1.1（2026-07-24）**：定向修订（依据《AI GitHub 助手执行方案修订任务单》）——冻结唯一根目录 `C:\AI_GitHelper-CN`；API Key 限可信上下文（setAccessLevel）；修正第三方端点数据流向表述；v1 固定 Provider 端点、禁自定义 Base URL；引入 Provider Capability 模型；**移除** GitHub Token 与私有仓库支持；operationPolicy 收紧（downloads 逐次确认、accountChanges 固定 deny）；新增 Git 基线/阶段提交/回滚规则；`Claude_Prompt.md` 降级为 `references/` 历史追溯文件。产品定位、MVP 功能范围、非目标**未变**。
- **v1.2（2026-07-24）**：最终定点修订——明确 Key 录入/保存路径与模块导入边界（D-028）；删除提前写死的截图坐标换算公式，改由 Phase 0 探针 B 实测决定（D-029）；D-007 修订为公共协议骨架+独立适配器+能力探针（D-030）；Phase 4 单 Provider 失败不阻塞 MVP（D-031）；GitHub API 限流按 resource 分桶+禁持续指数重试（D-032）；openPage 拆分限域+Scheme 黑名单（D-013 v1.2 修订）；三种数据清除操作明确化（D-033）；manifest 增加 `minimum_chrome_version: "114"`（D-035）；DeepSeek 模型策略精确化（别名 2026-07-24 15:59 UTC 停用，推荐 `deepseek-v4-flash`，D-034）。产品定位、MVP 功能范围、非目标**未变**。
- **v1.3（2026-08-03）**：经项目负责人明确授权，将固定 Provider 目录由三家扩展为八家；原三家保留静态 Host 权限，OpenAI / Anthropic / Gemini / Qwen / SiliconFlow 使用保存 Key 时逐家申请的精确可选 Host 权限；加入只含 model 绑定的无密钥设置 JSON。继续禁止任意 Base URL、自定义 Host、凭据导入导出和未经探针声明能力（D-063）。既有功能、默认路由、MVP 可用性门槛与安全边界**未变**。
- **v1.4（2026-08-20）**：经项目负责人明确授权，加入 GLM / Kimi / Grok 官方端点和一个受限 custom OpenAI-compatible Provider；UUAPI 降为旧配置兼容并移出常用选择器。custom 只允许经校验的 HTTPS URL，使用未授予的可选 Host 候选声明和用户手势中的精确 Host 授权；Key 仍独立存储且不进入 JSON。既有 GitHub 功能、写操作禁令、默认文本路线与 MVP 可用性门槛**未变**（D-068）。
- **v1.5（2026-08-21）**：经项目负责人明确授权，暂停 Chrome Web Store 上架并改为发布 GitHub Release `v0.1.0`。发布物限定为可校验的扩展 ZIP，用户解压后用开发者模式加载；Phase 14 同步清除正式运行时中的 Phase 0 调试入口与批量能力探针 UI，保留单 Provider“测试 Key 与模型”。产品功能、Provider/权限、安全边界与 BYOK 数据流**未变**（D-070）。

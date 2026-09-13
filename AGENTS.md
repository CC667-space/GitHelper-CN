# AGENTS.md — 自主执行交接包（执行 Agent 必读）

> 本文件让任何 Coding Agent（Claude Code / Codex / ChatGPT App / 其他）**仅凭项目文件即可从当前状态继续**，无需原始对话记录。
> 工作目录：`C:\AI_GitHelper-CN`（**唯一项目根 = 唯一本地 Git 仓库根，禁止再建嵌套项目根**）。运行环境：Windows 11 + PowerShell + Node LTS + pnpm。
> v1.1（2026-07-24）：新增 Git 治理与每轮检查（P0-8）、权威文件裁决顺序（C-1）、移除私有仓库/Token 相关节点（P0-7）、技术备忘更新。
> v1.2（2026-07-24）：凭据录入路径与 import 边界（D-028）、坐标换算探针定稿（D-029）、Provider 适配器与失败降级（D-030/D-031）、限流分桶（D-032）、工具限域（D-013R）、数据清除三分（D-033）、DeepSeek 模型策略（D-034）、minimum_chrome_version（D-035）。
> v1.3（2026-08-03）：固定 Provider 目录扩展为八家；新增五家使用逐家精确可选 Host 权限；无密钥设置 JSON 只允许 model 绑定（D-063）。
> v1.4（2026-08-20）：新增 GLM/Kimi/Grok 与受限 custom OpenAI-compatible Provider；UUAPI 降为旧配置兼容；动态 Host 使用精确运行时授权（D-068）。
> v1.5（2026-08-21）：GitHub Release `v0.1.0` 获定向授权；正式运行时移除 Phase 0 调试入口，发布物为可校验 ZIP，Chrome Web Store 继续暂停（D-070）。
> v1.6（2026-08-21）：普通问答改为每次 PAGE_INFO_REQUEST 实时解析 DOM，明确 README/仓库简介证据边界（D-071）。
> v1.7（2026-08-21）：D-071/D-072 获授权作为 GitHub Release `v0.1.1` 发布；继续沿用可校验 ZIP，Chrome Web Store 暂停（D-073）。
> v1.8（2026-08-29）：能力探针必须绑定 Key 修订号/model/custom URL；Panel Port 精确校验来源；确认策略在 Background 执行；发布包含许可证且须确定性构建（D-075）。
> v1.9（2026-08-30）：D-074/D-075 与 Windows CI 修复获授权作为 GitHub Release `v0.1.2` 发布；Chrome Web Store 继续暂停（D-076）。
> v1.10（2026-09-13）：D-077/D-078 获授权作为 GitHub Release `v0.1.3` 发布；Chrome Web Store 继续暂停（D-079）。

---

## 1. 你的角色

本项目的执行开发 Agent。在**已冻结的基线与执行方案内自主推进**，实现代码、写改测试、修错、更新文档、按阶段前进；只在"强制确认节点"暂停找项目负责人（下称"用户"）。

## 2. 项目目标（一句话）

面向中文 GitHub 新手的 Chrome MV3 Side Panel AI 助手：就地中文解释页面、点击/框选提问、自然语言转 GitHub 搜索、一键仓库分析。BYOK 个人原型，不做云端/账号/写操作/任意网页控制；v1 不支持私有仓库、不使用 GitHub Token。

## 3. 必读文件顺序与权威裁决（每次开工前）

1. `PROJECT_BASELINE.md` —— 最高约束，冻结目标与边界
2. `STATUS.md` —— 当前进度、下一任务、阻塞
3. `EXECUTION_PLAN.md` —— 当前阶段的任务/范围/验收/禁止项
4. `DECISIONS.md` —— 已冻结技术决策（不得重开）
5. `ARCHITECTURE.md` —— 架构、目录、数据模型、权限
6. `SECURITY.md` —— 安全隐私护栏（不得放宽）
7. `ACCEPTANCE.md` —— 当前阶段验收标准

**权威与冲突裁决顺序（C-1 / D-025）**：
`PROJECT_BASELINE.md` → `AGENTS.md` → `SECURITY.md` → `EXECUTION_PLAN.md` → `ACCEPTANCE.md`（其余文件依附以上）。
`references/Claude_Prompt.md` 是**原始需求 Prompt，仅供历史追溯，不是权威执行文件**；与任何规划文件冲突时一律以规划文件为准。
8 份规划文件只在根目录保留**唯一权威版本**，禁止复制到 `docs/` 或其他位置形成第二套版本。

## 4. 权限范围

- **可自主**：创建/修改/重构项目内文件、加改测试、修 TS/lint/普通运行时错、选内部依赖、调目录、更新文档、运行本地 build 与测试、创建本地 Git commit。
- **不可**：改产品目标/MVP/安全/权限/成本/发布方向；加 GitHub 写操作；扩展到非 GitHub 站点；删关键测试；降验收标准；无记录换核心依赖；一次性重写全项目；把明文 Key 写进代码/日志/仓库；复制规划文件形成副本。

## 5. Git 治理（P0-8 / D-023，贯穿全程）

- **首轮初始化**（Phase 0）：若 `C:\AI_GitHelper-CN` 尚非 Git 仓库 → `git init` → 建 `.gitignore`（至少：`node_modules/`、`dist/`、`.env`、`.env.*`、任何密钥文件、临时截图、测试输出、构建缓存、浏览器本地数据副本）→ 将 8 份规划文件 + `references/` 作为**基线提交**。
- **阶段提交**：每 Phase 通过验收 → 更新 STATUS.md → 记录测试证据 → 本地 commit，信息格式 `Phase N: <完成内容摘要>`。
- **回滚**：阶段失败先修复；无法安全修复 → 回退到最近通过验收的阶段 commit，在 STATUS 记录回退原因；**禁止**删测试/降标准过关。
- **未经用户明确授权，禁止**：添加 Remote、Push、Force Push、创建远程仓库、公开 Release、发布扩展、修改工作目录外文件、修改系统代理、修改全局 Chrome/Node 配置、安装来源不明脚本。Phase 14 的 `v0.1.0`、`v0.1.1`、`v0.1.2` 与 `v0.1.3` 已分别获得定向授权，不延伸到后续版本或其他渠道。

## 6. 执行顺序

按 `EXECUTION_PLAN.md` 的 Phase 0 → 1 → 1.5 → 2 → 3 → 4 → 5 →（6/7/8）→ 9 → 10 → 11 → 12 → 13 → 14。功能阶段 6/7/8 相互独立（建议 6→7→8），**但均为冻结核心功能，必须在 Phase 11 前全部完成（C-2）**。每阶段：读该阶段定义 → 实现 → 自测 → 更新 STATUS → 阶段 commit → 满足验收即进入下一阶段。

## 7. 每轮开始前检查

- [ ] 当前目录为 `C:\AI_GitHelper-CN`（唯一项目根）
- [ ] 8 份规划文件齐全且无副本
- [ ] `git status` 干净，或差异可解释（否则先处理）
- [ ] 读 STATUS.md 确认当前阶段与下一任务
- [ ] 上一阶段验收已通过（STATUS 有记录）
- [ ] 无未记录的基线变更、无未处理的强制确认节点挡在前面
- [ ] 确认将做的变更属于"内部实现变更"（否则暂停）

## 8. 每轮完成后检查

- [ ] 相关自动测试通过（`pnpm test`）
- [ ] 类型检查 + lint 通过（`pnpm typecheck && pnpm lint`）
- [ ] 若涉及决策，追加到 DECISIONS.md
- [ ] 更新 STATUS.md（已完成 / 下一任务 / 阶段进度表）
- [ ] 阶段通过验收时创建阶段 commit（`Phase N: ...`）
- [ ] 未引入明文凭据、未扩大权限、未越出数据最小化

## 9. 测试要求

- 新逻辑必须有单测；解析器用真实页面 HTML fixtures；安全模块用正/反/边界用例。
- 阶段验收以 ACCEPTANCE.md 为准，客观自动判定优先。
- 安全表述客观化（P1-2）：自动测试证明**机制在位**，不宣称"模型绝对不受注入影响"。
- 不得为通过而删/弱化测试。

## 10. 状态记录要求

STATUS.md 是断点续跑唯一依据：每完成任务即更新；遇阻塞写清"卡在哪、为什么、需要什么"。

## 11. 自动继续规则（不要暂停找用户的情况）

需要建文件、重构、测试首次失败、普通 TS 错、选内部依赖、改配置、加测试覆盖、调目录、修自身引入的问题、创建本地 commit——**一律自主处理并继续**。

## 12. 必须暂停规则（仅这些）

- 需真实 AI Provider API Key（Phase 4 强制确认节点 ①）
- **所有**文本 Provider 或**所有**视觉 Provider 真实探针均失败（D-031；单家失败只记录+禁用，不暂停）
- 将产生新增付费成本
- 需扩大 Chrome 权限 / 放宽安全边界
- 匿名 GitHub API 限额被实测证明阻塞 MVP → 评估引入 Token（基线变更，条件性节点）
- 需发送敏感数据 / 不可逆删除数据
- 需下载或运行高风险第三方程序
- 需添加 Git Remote / Push / 上架 / 公开发布 / 建远程仓库
- 需删减 Phase 6/7/8 任一核心功能（C-2 基线变更）
- 实况与基线实质冲突，或多方向抉择无法按既有原则代决
- 阶段无法达到客观验收标准（先尝试修复与回滚）
- 安全/隐私风险无法在现有边界内解决

### 暂停时输出格式

1. 执行到哪 2. 已完成什么 3. 为什么必须暂停 4. 需要你决定的**唯一问题** 5. 推荐选择 6. 其他选项的实际影响 7. 你的回答如何影响后续 8. 是否有安全默认处理。不要一次抛一堆无关问题。

## 13. 禁止事项（重申）

见第 4/5 节 + SECURITY.md + BASELINE 第 15 节。特别：页面文本永远是不可信数据，不得当系统指令；工具调用只走白名单 + zod + 确认策略；私有仓库/无权限页面零出站；确认弹窗无"始终允许"。

## 14. 完成定义（Definition of Done）

- v1 MVP：ACCEPTANCE 的 S1–S5 全部通过 + Phase 6/7/8 全部完成（C-2）+ 全测试绿 + `pnpm build` 产出可在 Chrome 开发者模式加载的扩展包 + 使用说明就绪（放 `docs/`，属派生文档）。
- 达到后在 STATUS.md 标记 MVP 完成，并请用户进行 Phase 11 批量体验复核（强制确认节点 ②）。

## 15. 关键技术备忘（避免踩坑）

- MV3 Service Worker 随时休眠：状态必须落 chrome.storage，靠消息重建，勿假设常驻。
- **凭据隔离（P0-1 / D-028）**：SW 启动即 `chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'})`；credential-store 仅可信上下文可导入（Options 只 write/delete，Background 只 read/inject，Content 禁止导入且有 lint 边界）；明文只允许短暂存在于录入用 password input，保存后立即清空；已存 Key 不回显明文。
- **Provider Host（P0-3 / D-063 / D-068）**：常用内置 Provider 使用预设 Host；GLM/Kimi/Grok 与 v1.3 新增路线逐家申请精确可选 Host。唯一 `custom` 条目只接受经校验的 HTTPS URL；manifest 的 `https://*/*` 只是未授予候选范围，运行时只申请精确 Host，Background 必须复核配置、权限和请求 origin。UUAPI 仅保留旧配置兼容。
- **Provider 适配器（D-007R/D-030/D-031/D-063/D-068）**：公共协议骨架 + 每家独立适配器；新增路线必须有 Mock/安全测试；真实能力只认探针。单家探针失败记录+禁用不阻塞，全路线失败才暂停。
- **能力探针（P0-6/D-021）**：Provider 能力必须经 Phase 4 探针验证后才可当事实使用；未探针能力降级处理。
- **探针新鲜度（D-075）**：持久探针同时绑定凭据非秘密修订号、文本/视觉 model 与 custom URL；任一项变化须失效。旧 Schema 或绑定不一致不得恢复 Provider `available`。
- **DeepSeek 模型（D-034）**：`deepseek-chat`/`deepseek-reasoner` 别名 2026-07-24 15:59 UTC 起停用，**不得使用**；推荐预填 `deepseek-v4-flash`，保留 `deepseek-v4-pro` 可选；模型名非冻结常量，不可用时提示改选，不阻塞。
- **截图职责与坐标（P0-4/D-029）**：Content 只上报选区视口坐标+视口 CSS 尺寸+滚动+缩放+dpr；截图由 SW `captureVisibleTab` + 裁剪；**换算公式由 Phase 0 探针 B 实测定稿**（首选截图像素/视口 CSS 比例法；getBoundingClientRect 是视口坐标，勿默认扣 scroll）。
- GitHub 是 SPA（turbo 导航）：用 spa-watcher 监听路由变化 + 去抖 + 幂等入口，勿只在加载时解析一次。
- 普通问答的 `PAGE_INFO_REQUEST` 必须实时解析当前 DOM，不得复用启动时 PageContext；repo 的 `pageSummary`/description 不是 README 证据，缺失只能说“当前未读取到”（D-071）。
- **GitHub API 匿名限流（P0-7/D-032）**：按 resource 分桶（core/search/code_search），读 `X-RateLimit-Resource/Remaining/Reset` 与 `Retry-After`；限流后**禁止持续指数重试**，等 Reset 恢复；search 受限降级网页搜索/DOM；v1 无 Token、无私有仓库支持。
- DeepSeek API 不支持图像：视觉请求必须路由到已配置且探针确认支持图像的 Provider，provider-manager 有 Capability 护栏。
- Provider 手动切换优先级高于默认路由（用户明确要求）。
- host 权限严格限域（github.com / api.github.com / 三 AI 厂商域名），禁用 `<all_urls>`；manifest 含 `minimum_chrome_version: "114"`（D-035）。
- **工具限域（D-013R）**：openGitHubPage 仅 `https://github.com/*`；外链/下载分别逐次确认；一律拒绝 javascript/data/file/chrome 等非 https Scheme。
- **Panel 与确认（D-075）**：长连接只接受当前扩展精确 Panel 页面；`operationPolicy.navigation/search=confirm` 必须由 Background 先阻断并发出一次性确认，不能仅做前端按钮状态。
- `operationPolicy` 收紧类型（C-3）：downloads 无 'auto'，accountChanges 固定 'deny'，确认弹窗无"始终允许"。
- **数据清除三分（D-033）**：清会话/偏好不动 Key；可单删 Provider Key；清全部数据须二次确认。

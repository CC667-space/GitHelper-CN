# EXECUTION_PLAN.md — 阶段化执行方案

> 依附 `PROJECT_BASELINE.md`。执行 Agent 按阶段顺序推进，阶段内自主执行，仅在"强制确认节点"暂停。
> 每完成一个阶段更新 `STATUS.md` 并创建阶段 Commit（见"Git 治理"）。验收标准细节见 `ACCEPTANCE.md`。
> v1.1（2026-07-24）：新增 Phase 1.5 安全地基、Phase 0 技术探针扩充、Git 治理、移除 Token/私有仓库相关内容。
> v1.2（2026-07-24）：探针 B 改为实测定稿坐标换算（D-029）；Phase 4 单 Provider 失败不阻塞（D-031）；限流分桶（D-032）；数据清除三分（D-033）；DeepSeek 模型策略（D-034）；minimum_chrome_version 114（D-035）。
> v1.3（2026-08-03）：固定 Provider 扩展为八家；新增五家采用逐家精确可选 Host 权限；设置 JSON 只绑定 model（D-063）。
> v1.4（2026-08-20）：新增 GLM/Kimi/Grok 与受限 custom OpenAI-compatible Provider；UUAPI 降为兼容项；新增 Phase 12（D-068）。
> v1.5（2026-08-21）：记录 Phase 13 公开源码与 Phase 14 GitHub Release 加固/发布；Chrome Web Store 继续暂停（D-069/D-070）。
> v1.6（2026-08-21）：记录 Phase 14 后续的普通问答 PageContext 定向维护补丁，不改变 Release 或 Chrome Web Store 状态（D-071）。
> v1.7（2026-08-21）：记录 D-072 字号/搜索连续性维护与获授权的 `v0.1.1` GitHub Release；Chrome Web Store 继续暂停（D-073）。
> v1.8（2026-08-29）：记录 Phase 14 后续分层审计维护：依赖、探针、确认/Port、模型目录、格式、许可证、确定性打包与 CI（D-075）；不含远程发布。
> v1.9（2026-08-30）：记录获授权的 `v0.1.2` 安全维护 Release，范围仅含 D-074/D-075 与 Windows CI 修复（D-076）。
> v1.10（2026-09-13）：记录获授权的 `v0.1.3` 维护 Release，范围仅含 D-077 与 GitHub Actions Node 24 运行时修复（D-078/D-079）。
> v1.11（2026-10-07）：记录发布后的模型目录与开发依赖定向维护；不含 Push、tag 或 Release（D-080）。

---

## 阶段总览与依赖图

```
Phase 0 (基线检查 + 环境 + 技术探针 + Git 初始化)
   │
Phase 1 (仓库结构 + 扩展骨架)
   │
Phase 1.5 (安全地基)  ◄── 必须先于任何真实 API 调用
   │
Phase 2 (Side Panel + 消息通信[含协议安全])
   │
Phase 3 (页面识别 + 上下文读取 + SPA 处理) ◄── 关键路径
   │
Phase 4 (Provider 抽象 + 能力探针 + 文本对话 + 手动切换) ◄── 关键路径
   │
Phase 5 (Session + 偏好 + 容量淘汰)
   │
   ├── Phase 6 (点击提问) ──┐  三个功能阶段相互独立
   ├── Phase 7 (框选+视觉) ─┤  （建议顺序 6→7→8）
   └── Phase 8 (NL 搜索) ───┘
   │
Phase 9 (一键仓库分析)   ← 依赖 3/4，可与 6-8 并行
   │
Phase 10 (安全加固 + 红队测试)
   │
Phase 11 (测试/打包/MVP 验收)  ← 汇聚，含唯一批量体验复核
   │
Phase 12 (Provider 目录扩展与受限 custom 端点) ← v1 MVP 后定向增强
   │
Phase 13 (GitHub 公开源码) ← 已完成
   │
Phase 14 (GitHub Release 加固与发布) ← 已完成；后续维护补丁不含 Chrome Web Store
```

**关键路径**：0 → 1 → 1.5 → 2 → 3 → 4 → 9 → 11。

**早期演示 vs 最终 MVP（C-2，重要）**：

- Phase 6（点击提问）、Phase 7（框选提问）、Phase 8（NL 搜索）**可以不阻塞早期技术 Demo**（Phase 4 后即可演示对话，Phase 9 后即可演示分析）；
- 但它们是**冻结的 v1 核心功能，必须阻塞最终 MVP 验收**——Phase 11 完成时三者必须全部实现并通过验收；
- 若确需删减任何一项，属**基线变更**，必须暂停请用户确认，不得静默降级。

---

## Git 治理（P0-8，贯穿全程）

- **工作目录固定**：`C:\AI_GitHelper-CN`（唯一项目根 = Git 仓库根，禁止嵌套项目根）。
- **首轮初始化**（Phase 0 内完成）：若尚非 Git 仓库 → `git init` → 建 `.gitignore`（至少排除：`node_modules/`、`dist/`、`.env`、`.env.*`、任何密钥文件、临时截图、测试输出、构建缓存、浏览器本地数据副本）→ 将 8 份冻结规划文件 + `references/` 作为**基线提交**。
- **阶段提交**：每 Phase 通过验收后：更新 `STATUS.md` → 更新必要文档 → 记录测试证据 → 创建本地 Commit，信息格式 `Phase N: <完成内容摘要>`。
- **回滚**：阶段失败先修复；无法安全修复 → 回退到最近通过验收的阶段 Commit，在 STATUS 记录回退原因；**禁止**用删测试/降标准过关。
- **未经用户明确授权，禁止**：添加 Remote、Push、Force Push、创建远程仓库、公开 Release、发布扩展、修改工作目录外文件、修改系统代理、修改全局 Chrome/Node 配置、安装来源不明脚本。
- **每轮执行开始前检查**：当前目录正确 → 规划文件齐全 → `git status` 干净或差异可解释 → 读 STATUS 确认当前阶段 → 上一阶段验收已通过 → 无未记录的基线变更。

---

## 通用规则（每个阶段都适用）

**允许 Agent 自主**：创建/重构文件、补类型、写改测试、修普通 TS/lint 错、调目录、选内部依赖、修自身引入的问题、更新技术文档。
**每阶段禁止**：改产品目标/MVP 范围、改安全权限边界、加写操作、扩展到非 GitHub 站点、删关键测试、降验收标准、无记录换核心依赖、一次性重写全项目、复制规划文件形成第二套权威版本。
**每阶段产物**：代码 + 通过的自动测试 + 更新的 `STATUS.md` + 阶段 Commit。

---

## Phase 0 — 基线检查、环境与技术探针

- **目标**：只读基线检查通过，工具链跑通，关键技术假设经真实探针验证，Git 基线建立。
- **前置**：无。
- **任务**：
  1. **只读基线检查**：确认 8 份规划文件齐全一致、工作目录正确、`references/Claude_Prompt.md` 就位。
  2. **Git 初始化**（见"Git 治理"）：init + .gitignore + 规划文件基线提交。
  3. 初始化 pnpm 项目、Node 版本锁、TS/ESLint/Prettier 配置。
  4. 建 Vite + CRXJS 最小 MV3 扩展（空 background + 静态 content script + 空 side panel，manifest 含 `minimum_chrome_version: "114"`，D-035），`pnpm build` 后可在 Chrome 开发者模式加载。
  5. **技术探针 A（基础）**：(a) side panel 打开；(b) content script 在 `github.com` 注入；(c) 读到当前 tab URL。
  6. **技术探针 B（截图坐标，P0-4 / D-029）**：验证 `captureVisibleTab` 由 SW 调用的完整链路，**实测定稿坐标换算方法**（不预设公式）：
     - 首选假设：`scaleX = 截图实际像素宽 / 视口 CSS 宽`（`scaleY` 同理），对比验证 dpr×zoom 推导；
     - `getBoundingClientRect()` 为视口坐标，验证**不额外扣 scroll** 是否正确；
     - 覆盖：Windows 高 DPI、浏览器缩放、页面滚动、`devicePixelRatio`、Side Panel 开启时可见区域、GitHub 固定页头；在真实 GitHub 页面取 3 个不同位置元素验证裁剪对齐；
     - 结论（最终公式 + 是否需要滚动/页头补偿）写入 `scripts/probe-results.md` 并**回写 ARCHITECTURE §3.5**。
  7. **技术探针 C（权限复审）**：验证 `activeTab` 是否足以支撑用户手势触发的截图；静态 content_scripts 是否够用（能否不申请 `scripting`/`tabs`）。输出最终权限清单，回写 ARCHITECTURE §6。
  8. **技术探针 D（存储访问级）**：验证 `chrome.storage.local.setAccessLevel('TRUSTED_CONTEXTS')` 生效——从 content script 上下文读取应失败。
- **产物**：可加载空扩展 + 探针 A-D 证据（截图/日志，记入 `scripts/probe-results.md`）+ Git 基线提交。
- **验收**：build 成功；扩展加载无报错；探针 A-D 全部有明确结论；权限清单定稿。
- **失败处理**：CRXJS 冲突 → 回退 D-002 备选；探针 B 坐标换算不可行 → 记录并将框选截图降级为"可见区整截 + 视觉模型内定位"，记 DECISIONS（不改产品范围）。
- **强制确认节点**：无。**自动进入 Phase 1**。

## Phase 1 — 仓库结构与扩展骨架

- **目标**：完整目录结构 + 四端入口 + 共享库骨架。
- **任务**：
  1. 按 ARCHITECTURE §4 建目录与空模块（`src/`、`tests/`、`scripts/`；`lib/types.ts` 落地 §5 数据模型，**含 ProviderCapabilities / ProviderCredential，不含 GitHubTokenConfig / allowPrivateRepos**）。
  2. 实现 `lib/storage`（schemaVersion + 迁移骨架 + getBytesInUse 容量检查）、`lib/messaging`（信封含版本/请求ID）、`lib/logger`（强制脱敏）。
  3. manifest 按 Phase 0 探针定稿的最小权限声明，host 严格限五域。
- **产物**：骨架代码 + 数据模型类型 + 共享库 + 单测（storage/messaging/logger）。
- **验收**：类型编译通过；单测通过；权限清单与 ARCHITECTURE 一致；无 docs/ 规划文件副本。
- **自动进入 Phase 1.5**。

## Phase 1.5 — 安全地基（P0-5，新增；必须先于任何真实 API 调用）

- **目标**：把 SECURITY §10 "早期安全地基"全部落地并可测试。
- **任务**：
  1. SW 启动即 `setAccessLevel('TRUSTED_CONTEXTS')`；`credential-store` 独立凭据接口（Options 只 write/delete，Background 只 read/inject，Content 禁止导入 + lint import 边界，D-028）。
  2. Provider API Host 白名单常量 + 出站 fetch 封装（白名单外域名直接拒绝，含单测）。
  3. `router` 消息来源验证（sender 校验）+ 消息类型/参数 zod Schema 验证 + 最大载荷 + 超时。
  4. 基础 `sanitizer`（核心凭据模式）+ 日志脱敏管道。
  5. 私有仓库阻断策略骨架（isPrivate → 零出站 + 提示）。
  6. System Prompt 与网页内容隔离的组装约定（页面数据永不进 system 角色）。
  7. CSP 与无远程代码检查（构建产物扫描脚本：无 eval/new Function/远程 script）。
  8. 请求取消（AbortController）、超时、最大负载限制封装。
- **产物**：安全地基模块 + 全部配套单测。
- **验收**：ACCEPTANCE "Phase 1.5" 全部用例通过（含：content script 上下文读凭据失败、白名单外 fetch 被拒、非法来源消息被拒、日志无明文 Key）。
- **自动进入 Phase 2**。

## Phase 2 — Side Panel 与消息通信

- **目标**：Panel UI 骨架 + 三端消息全链路（走 Phase 1.5 的安全信封）。
- **任务**：
  1. React + Tailwind + Zustand 搭 Panel 骨架（会话区/输入区/顶部 Provider 下拉占位）。
  2. Panel↔BG 长连接（流式回推占位）；BG↔Content 请求-响应。
  3. Content 响应"取当前页面信息"返回占位数据。
  4. Options 页骨架（含数据流向披露区占位）。
- **验收**：Panel 打开；一条消息完成 Panel→BG→Content→Panel 往返（经来源+Schema 校验）；集成测试断言往返与非法消息被拒。
- **自动进入 Phase 3**。

## Phase 3 — GitHub 页面识别与上下文读取（关键路径）

- **目标**：识别页面类型 + DOM 优先解析 PageContext + SPA 变化跟踪。
- **任务**：
  1. `detector` 按 URL+DOM 识别 repo/issue/pr/releases/blob/search 等。
  2. 各 `parsers/*` 产出结构化数据（容错、失败降级）。
  3. `spa-watcher`（P1-4）：pushState/replaceState/popstate/turbo 事件 + MutationObserver 兜底；解析去抖；入口幂等防重复初始化；页面切换清理旧选择状态、失效旧上下文。
  4. 私有仓库/无权限页面检测（isPrivate → 走 Phase 1.5 阻断策略）。
- **产物**：解析器 + 基于真实页面 HTML fixtures 的单测。
- **验收**：fixtures 各页面类型正确识别解析；SPA 切换触发去抖刷新且不重复初始化；私有页面被阻断；解析失败不抛未捕获异常。
- **失败处理**：某页面类型解析不稳 → 降级纯文本提取，记 STATUS，不阻塞。
- **自动进入 Phase 4**。

## Phase 4 — Provider 抽象 + 能力探针 + 文本对话 + 手动切换（关键路径）

- **目标**：八个固定 Provider 适配器全部完成（代码+Mock 测试）、能力经探针验证、可手动切换、文本对话流式闭环。
- **任务**：
  1. `providers/base` 公共协议骨架（chat/chatStream/abort/capabilities，OpenAI 兼容组装）+ DeepSeek / UUAPI / OpenRouter / OpenAI / Anthropic / Gemini / Qwen / SiliconFlow **独立适配器**（D-007R/D-030/D-063；**固定 apiHost 预设，无自定义 Base URL**；model 可配置）。原三家沿用静态 Host，新增五家保存 Key 时逐家申请精确可选 Host 权限。
  2. **DeepSeek 模型策略（D-034/D-080）**：不使用 `deepseek-chat`/`deepseek-reasoner` 别名（2026-07-24 15:59 UTC 已停用）；新配置推荐低价 `deepseek-flash`，文本保留 `deepseek-v4-pro`，视觉只建议 `deepseek-flash`；已保存 Model ID 不覆盖，实际可用性经探针确认；推荐模型不可用 → 提示改选，不阻塞。
  3. 每 Provider 声明 `ProviderCapabilities`；实现**能力探针**（D-021）：文本、流式、取消、图片输入、工具调用、结构化输出、错误/限流响应格式。探针结果写入 `capabilities.probedAt`，未验证能力不得使用。
  4. `provider-manager`：默认路由 + **手动覆盖优先** + Capability 护栏（needsVision 而 supportsVision=false → 阻止并提示）+ 不可用 Provider 禁用标记。
  5. `context-builder` 最小上下文（接 sanitizer）。
  6. Panel 顶部 **Provider 手动切换下拉**（文本/视觉分列，显示当前 model 与 Host，不可用 Provider 置灰）。
  7. Options：各 Provider Key 录入（password input，保存后立即清空；经 credential-store，UI 只见掩码、无明文回显）、model 选择、**数据流向披露**（当前 Provider/Host/模型/数据去向/是否中转/兼容层说明）；可导入/导出仅含 model 绑定的设置 JSON，严禁 Key 与 URL/Host/endpoint。
  8. 流式渲染 + Abort + 错误处理（鉴权/额度/限流可读提示 + 建议切换）。
- **产物**：文本对话可用 + 探针报告 + 单测（provider mock、路由、护栏、凭据隔离）。
- **验收**：八适配器 mock 全部跑通请求组装/流式/取消路径；新增五家权限申请/拒绝/释放与设置 JSON 白名单测试通过；手动切换生效；Capability 护栏生效；凭据隔离测试通过（消息载荷/UI 状态/日志无已存明文 Key）。
- **可用性判定与失败处理（D-031）**：
  - 真实端点只强制**至少一个文本 Provider + 一个视觉 Provider 可用**；
  - 单个外部 Provider 真实探针失败 → 记录原因 + UI 禁用该 Provider → **继续，不阻塞**；
  - **所有**文本路线或**所有**视觉路线均失败 → 暂停找用户（外部依赖阻塞）。
- **强制确认节点 ①**：**首次填入任一真实 Provider Key** → 暂停，交用户填入；随后对真实端点跑一轮能力探针 + 手测一次真实对话。已有 Key 不因目录扩展而重新填写；新增 Provider 只有用户实际选择使用时才需 Key。
- 确认后**自动进入 Phase 5**。

## Phase 5 — Session 与本地偏好

- **目标**：会话 CRUD + 恢复 + 摘要 + 偏好管理 + 容量淘汰 + 数据清除。
- **任务**：
  1. `session-store`：新建/继续/最近/删除/页面关联/30 天过期。
  2. 长对话摘要 + 上下文长度控制。
  3. **容量与淘汰**（P1-1，按 ARCHITECTURE §8）：限额常量、getBytesInUse 检查、淘汰顺序实现、Options 显示用量。
  4. `prefs-store` + Options 偏好表单（技术水平/系统/解释偏好/operationPolicy【收紧版：downloads 无 auto、accountChanges 固定 deny】/visionEnabled）。
  5. 数据清除三分（D-033）：清除会话/偏好（不动 Key）、单独删 Provider Key、二次确认清除全部本地数据。
- **验收**：会话保存后重开 Panel 可恢复；过期与超限淘汰生效；偏好读写生效；三种清除各自"目标无残留、非目标完好"；operationPolicy 类型不允许非法值。
- **自动进入 Phase 6**。

## Phase 6 — 点击元素提问（MVP 必达，C-2）

- **目标**：pick 模式选中元素并提问。
- **任务**：`selection/pick` 叠层高亮 + 提取 SelectedElement + 接入 AI 流；SPA 切换清理 pick 状态。
- **验收**：能进入/退出 pick 模式；选中元素结构提取正确；提问得到基于该元素的回答；集成测试断言选中数据结构。
- **自动进入 Phase 7**。

## Phase 7 — 框选区域与视觉输入（MVP 必达，C-2）

- **目标**：drag 框选 + 结构化优先 + 不足时截图走视觉。
- **任务**：`selection/region` 画框 + 结构化提取 + 坐标/dpr/滚动/缩放上报；**SW 侧 `capture` 模块** captureVisibleTab + 裁剪（P0-4 职责划分）；视觉 Provider 调用（Capability 护栏 + 消耗提示 + visionEnabled 开关）。
- **验收**：框选提取结构化数据；结构充分时不截图；不足时 SW 截图裁剪对齐（复用 Phase 0 探针 B 的验证方法）并走视觉 Provider；visionEnabled=false 时禁用视觉；截图不持久保存。
- **自动进入 Phase 8**。

## Phase 8 — 自然语言 GitHub 搜索（MVP 必达，C-2）

- **目标**：中文 NL → GitHub 搜索语句/API 参数 → 结果。
- **任务**：搜索工具（searchRepos/searchIssues，匿名 API + **search 桶独立节流**，D-032）+ NL 转换 prompt + 结果渲染；公开搜索自动执行；展示简短查询解释；search 桶受限时降级为打开 GitHub 网页搜索或本地 DOM 结果。
- **验收**：≥5 组中文查询转出合理 GitHub 语法；仓库/Issue 搜索返回结果；search 限流降级可读且不指数重试。
- **自动进入 Phase 9**。

## Phase 9 — 一键仓库分析（关键路径）

- **目标**：结构化中文仓库分析卡片。
- **任务**：聚合 DOM + **匿名** GitHub API（缓存 + 按 resource 分桶节流，D-032）→ 固定 JSON schema（用途/语言/平台/安装/Release/更新/Star/归档/许可证/Issue-PR/难度/风险/下一步）→ 渲染中文卡片；可变数据事实回填防幻觉；structuredOutput 能力不可用时按 D-021 降级。
- **验收**：≥3 个真实公开仓库产出完整卡片；关键数字来自 DOM/API；缺字段优雅降级；匿名限额撞墙时降级提示正常。
- **注**：v1 无 GitHub Token 节点（D-022）。若实测匿名限额确实阻塞 MVP → 暂停，作为基线变更请用户评估 Token 引入。
- **自动进入 Phase 10**。

## Phase 10 — 安全加固与红队测试

- **目标**：SECURITY §10 "后期安全加固"全部完成。
- **任务**：完善 sanitizer 规则集；Prompt Injection **红队测试**（构造攻击样例 + 记录结果，见 P1-2 表述边界）；私有页面零出站复验；工具白名单越权测试（含非 https Scheme 拒绝：javascript/data/file/chrome 等，D-013R）；权限复查（对照 Phase 0 探针 C 结论）；三种数据清除测试（D-033）；泄漏检查（出站体/日志扫描）。
- **产物**：安全测试套件 + 红队测试记录（`tests/security/redteam-log.md`）。
- **验收**：ACCEPTANCE 安全用例全部通过；红队记录含 ≥10 个攻击样例与结果。
- **自动进入 Phase 11**。

## Phase 11 — 测试、打包与 MVP 验收（汇聚）

- **目标**：整体测试通过 + 可分发扩展包 + 唯一一次批量体验复核。
- **前置**：**Phase 6/7/8 必须已完成并通过验收**（C-2：核心功能不得缺席最终 MVP）。
- **任务**：补齐单元/组件/集成/E2E（Playwright 加载扩展）；`pnpm build` 产出可加载包（`dist/`）；跑通成功标准 S1-S5；整理使用说明（放 `docs/`，属派生文档）。
- **验收**：ACCEPTANCE 全绿；打包可加载；S1-S5 每条有证据。
- **强制确认节点 ②（批量体验复核）**：交用户在真实 Chrome 手工体验 S1-S5 闭环，确认 MVP 达标。这是**唯一的人工体验验收节点**。

## Phase 12 — Provider 目录扩展与受限 custom 端点

- **目标**：不改变既有 GitHub 功能，加入 GLM / Kimi / Grok 官方端点和一个受限 OpenAI-compatible custom Provider；UUAPI 仅保留旧配置兼容。
- **任务**：
  1. Catalog 加入三家固定官方 endpoint、已核对 model 候选和独立适配器；逐家使用精确可选 Host。
  2. custom 非秘密配置只含 HTTPS Base URL/完整 Chat Completions URL 与 model；Key 仍走 credential-store，禁止导入导出凭据。
  3. custom URL 拒绝 credentials/query/fragment、非默认端口、localhost、私网/回环/链路本地/保留地址字面量；权限只申请精确 Host；Background 复核配置、权限与请求 origin，并拒绝重定向。
  4. Options/Panel 加入新候选；custom 先保存 URL/model 再保存 Key。UUAPI 从新选择器隐藏，但旧配置、凭据和适配器不删除。
  5. 设置 JSON 升级并兼容 v1；内置条目只允许 model，custom 可含非秘密 URL/model；导出白名单重建，错误不回显输入。
  6. 更新披露、权限表、测试与本地包；不读取已有 Key，不主动调用没有 Key 的新 Provider。
- **验收**：新增四条适配路线 Mock 全过；固定/动态 Host 权限、URL 拒绝矩阵、跨 origin/重定向阻断、JSON 凭据拒绝、v1 迁移、UUAPI 隐藏兼容、Options/Panel 和构建 manifest 均有自动测试；typecheck、lint、全量测试、build、安全扫描与隔离 Chrome E2E 通过。
- **真实验证**：没有新 Key 不阻塞自动验收。若需填写新 Key或产生真实请求费用则暂停。

## Phase 13 — GitHub 公开源码

- **目标**：以 MIT License 公开现有源码，不发布安装包或 Chrome Web Store。
- **验收**：公开仓库、历史邮箱隐私处理、Push 前全历史凭据审计与完整质量门禁通过。
- **状态**：已完成（D-069）。

## Phase 14 — GitHub Release 加固与发布

- **目标**：在不扩展产品功能和 Chrome 权限的前提下，发布可下载、可校验、可按 README 直接加载的 `v0.1.0` 扩展 ZIP。
- **任务**：
  1. 清除正式运行时中的 Phase 0 技术探针消息、页面 DOM 触发器和 Options“本地技术验证”；按既有产品要求移除批量真实探针 UI，保留每个 Provider 的“测试 Key 与模型”。
  2. 增加 16/32/48/128 四档扩展图标，并在 manifest/action 中引用；不新增权限或 Host。
  3. 打包脚本从 `package.json` 读取版本，生成 `GitHelper-CN-v0.1.0-chrome.zip` 与 SHA-256 文件；校验 ZIP 根 `manifest.json`、版本、图标和禁止条目。
  4. README 顶部提供从 Release 下载、校验、解压、开发者模式加载、Provider 配置、首次使用和更新的完整快速上手；明确 Source code ZIP 与扩展 ZIP 的区别。
  5. 更新必要的基线、架构、安全、决策、验收、状态与用户指南，不创建第二套规划文件。
  6. 运行 typecheck、lint、变更源文件 Prettier check、`git diff --check`、全量测试、build、安全扫描、隔离 Chrome E2E、打包与发布前凭据审计。
  7. 创建 `Phase 14:` 本地提交，合并/推送既有 `main`，创建并验证 tag 与 GitHub Release `v0.1.0`；只上传版本化 ZIP 与校验文件。
- **验收**：正式 bundle 不含 Phase 0 入口；Options 无开发专用区且单 Provider 测试仍可用；manifest 与 ZIP 图标完整；所有质量门禁通过；凭据审计零真实 Key；公开 Release/tag/两项资产存在，校验值与本地一致；README 安装路径可照做。
- **范围**：不调用真实 Provider、不读取已保存 Key、不修改 Chrome 权限/Host/核心功能；不推进 Chrome Web Store，不生成或声称一键 CRX。
- **授权**：项目负责人已明确授权 Phase 14 的既有 `origin` Push、tag、GitHub Release 与安装资产公开发布。其他发布渠道仍须另行确认。

### Phase 14 后续维护补丁 — 当前页面问答上下文（D-071）

- **目标**：修复同一仓库页面 README 延迟渲染后普通问答仍使用旧 PageContext，以及项目简介被误当成 README 的问题。
- **实现边界**：每次 `PAGE_INFO_REQUEST` 重读当前 DOM；兼容当前 `article.markdown-body` README 容器；为 Provider 标注简介/README/License/安装说明的证据状态。
- **验收**：固定仓库初载、滚动后、重新提问三个时点有可重复测试；README 8,000 字与整体 32KB 限制有断言；未读取到时只能说明当前证据缺失。
- **范围**：不新增 Chrome 权限、GitHub API/Provider 调用、完整仓库读取、持久数据或发布授权。

### Phase 14 维护版 — 字号、搜索连续性与 `v0.1.1`（D-072/D-073）

- **内容**：Side Panel 14/16/18px 字号；按 GitHub `tabId` 保存最近一次成功搜索的 2 小时 `storage.session` 快照；搜索结果前台/后台打开；把 D-071/D-072 发布为 `v0.1.1`。
- **发布门禁**：复跑 typecheck、lint、变更文件格式、`git diff --check`、全量测试、build、安全扫描、隔离 Chrome E2E、版本化打包与源码/历史/`dist`/ZIP 凭据审计。
- **远程验收**：`origin/main`、注释 tag `v0.1.1`、非 draft/prerelease Release，以及仅 ZIP/SHA-256 两项资产均存在且 digest 与本地一致。
- **范围**：不新增 Chrome 权限/Host、Provider 请求、GitHub 写操作、长期搜索历史、自动重开 Panel 或 Chrome Web Store 发布。

### Phase 14 后续分层审计维护（D-075）

- **内容**：修复已确认的生产/开发依赖告警；让能力探针绑定 Key 修订号和实际 model/custom URL；在 Background 落实 navigation/search 确认策略并收紧 Panel Port 来源；核对易变 model 候选；统一 LF/Prettier；补齐生产依赖许可证、确定性 ZIP 与最小 Windows CI。
- **门禁**：frozen install、`pnpm audit` 零告警、许可证清单再生成零差异、typecheck、lint、format、全量测试、build、安全扫描、隔离 Chrome E2E、重复打包哈希一致、凭据扫描与 `git diff --check`。
- **范围**：只做仓库维护与既有安全契约落地；不新增 Chrome 权限/Host、产品功能、真实 Provider 请求、GitHub 写操作、tag、Release 或 Chrome Web Store 工作。

### Phase 14 安全维护版 — `v0.1.2`（D-076）

- **内容**：发布 D-074 测试哨兵/安全政策加固、D-075 依赖与运行时安全接缝修复，以及 Windows CI 的 PowerShell 7 打包入口修复。
- **发布门禁**：frozen install、零依赖告警、许可证再生成零差异、typecheck、lint、全仓 format、`git diff --check`、全量测试、build、安全扫描、隔离 Chrome E2E、连续两次确定性打包，以及源码/历史/`dist`/ZIP 凭据审计。
- **远程验收**：版本提交与 `origin/main` 一致；Quality workflow 成功；注释 tag `v0.1.2` 指向版本提交；Release 公开、非 draft/prerelease 且设为 latest；只含 ZIP/SHA-256 两项资产，远端 digest 与本地一致。
- **升级提示**：旧探针 Schema 会失效但不删除已保存 Key；Provider 显示未验证时由用户按需重新运行单家“测试 Key 与模型”。
- **范围**：不新增产品功能、Chrome 权限/Host、Provider、真实 Provider 请求、GitHub 写能力、CRX 或 Chrome Web Store 工作。

### Phase 14 维护版 — `v0.1.3`（D-078/D-079）

- **内容**：发布 D-077 的 Vitest 4.1.11 安全修复与 2026-09-13 Provider 模型候选刷新；把 Quality workflow 的 checkout/setup-node/pnpm setup 更新到声明 Node 24 运行时的稳定主版本，消除 Node.js 20 弃用警告。
- **发布门禁**：frozen install、零依赖告警、许可证再生成零差异、typecheck、lint、全仓 format、`git diff --check`、全量测试、匿名 GitHub live test、build、安全扫描、隔离 Chrome E2E、连续两次确定性打包，以及源码/历史/`dist`/ZIP 凭据审计。
- **远程验收**：版本提交与 `origin/main` 一致；Quality workflow 全步骤成功且不再产生三个 Action 的 Node.js 20 弃用警告；CodeQL 成功；注释 tag `v0.1.3` 指向版本提交；Release 公开、非 draft/prerelease 且设为 latest；只含 ZIP/SHA-256 两项资产，远端 digest 与本地一致。
- **配置保障**：模型目录已由项目负责人人工确认；已保存 Model ID 继续优先，不迁移、不覆盖；本轮不读取真实 Key 或运行真实 Provider 探针。
- **范围**：不新增产品功能、Chrome 权限/Host、Provider、真实 Provider 请求、GitHub 写能力、CRX 或 Chrome Web Store 工作。

### Phase 14 后续本地维护 — 模型目录与依赖（D-080）

- **内容**：按官方资料更新 OpenAI、Anthropic、DeepSeek、Qwen 的便捷候选；新增当前模型、移出新配置中的过时模型并保留低价路线；为 DeepSeek Flash 接入既有视觉消息格式；刷新受公告影响的开发依赖锁。
- **配置保障**：目录默认值只用于缺失配置；已保存 Model ID 不迁移、不覆盖。模型存在不等于账号可用，文本/视觉能力仍只认对应 Key/Model 的真实探针。
- **门禁**：零依赖告警、typecheck、lint、format、全量测试、build、安全扫描、隔离 Chrome E2E 与 `git diff --check`。
- **范围**：不新增 Provider、endpoint、Chrome 权限/Host，不读取真实 Key，不调用真实 Provider，不 Push、不创建 tag 或 Release。

---

## 强制确认节点清单（v1.11）

1. **Phase 4**：首次填入真实 AI Provider Key（凭据）—— 必需。
2. **Phase 11**：MVP 批量体验复核（真实交互验收）—— 必需。
3. **条件性**：匿名 GitHub API 限额被实测证明阻塞 MVP → 评估 Token（基线变更）；**所有**文本 Provider 或**所有**视觉 Provider 真实探针均失败（D-031）；触及付费/权限扩大/发布/Git Remote 与 Push → 即时暂停。

Phase 13 公开源码与 Phase 14 `v0.1.0`/`v0.1.1`/`v0.1.2`/`v0.1.3` GitHub Release 已分别获得明确授权，不重复暂停；授权不覆盖 Chrome Web Store、Force Push、其他仓库或 `v0.1.3` 之后的版本发布。

**注意（D-031）**：单个 Provider 探针失败**不是**暂停节点——记录、禁用、继续。

其余一切（建文件、重构、修错、加测试、选内部依赖、调结构）**一律自主执行，不得暂停找用户**。

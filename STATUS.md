# STATUS.md — 当前进度与状态

> 执行 Agent 每完成一个任务/阶段必须更新本文件。这是断点续跑的依据。

---

## 当前阶段
**Phase 1.5 已通过验收。下一步进入 Phase 2（Side Panel + 消息通信）。**

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

## 下一任务
**Phase 2 — Side Panel + 消息通信**（见 EXECUTION_PLAN v1.2）。
执行 Agent 应继续：
1. 落地 React + Tailwind + Zustand Panel 骨架与 Provider 占位
2. 建立 Panel ↔ Background 长连接及流式事件占位
3. 建立 Background ↔ Content 页面信息请求/响应
4. 完成 Options 披露占位和通信集成测试

## 阶段进度表
| Phase | 状态 |
|---|---|
| 0 基线检查 + 环境 + 技术探针 + Git 初始化 | ✅ 已完成 |
| 1 仓库结构 + 扩展骨架 | ✅ 已完成 |
| 1.5 安全地基 | ✅ 已完成 |
| 2 Side Panel + 消息通信 | ⬜ |
| 3 页面识别 + 上下文 + SPA | ⬜ |
| 4 Provider + 能力探针 + 对话 + 手动切换 | ⬜ |
| 5 Session + 偏好 + 容量淘汰 | ⬜ |
| 6 点击提问（MVP 必达） | ⬜ |
| 7 框选 + 视觉（MVP 必达） | ⬜ |
| 8 NL 搜索（MVP 必达） | ⬜ |
| 9 一键仓库分析 | ⬜ |
| 10 安全加固 + 红队测试 | ⬜ |
| 11 测试 + 打包 + MVP 验收 | ⬜ |

## 待处理的强制确认节点（尚未触发）
- ⏸ Phase 4：填入真实 Provider Key（必需）
- ⏸ Phase 11：MVP 批量体验复核（必需）
- ⏸ 条件性：匿名 GitHub API 限额实测阻塞 MVP → 评估 Token（基线变更）；所有文本或所有视觉 Provider 真实探针均失败（D-031）；触及付费/权限扩大/发布/Git Remote 与 Push → 即时暂停

## 阻塞
无。

## 变更记录
- 2026-07-23：完成全部规划文档，基线冻结 v1.0。
- 2026-07-24：目录更名为 `C:\AI_GitHelper-CN` 并冻结为唯一项目根；完成 v1.1 定向修订（安全/权限/MV3/Provider 兼容/GitHub 边界/Git 治理/一致性/验收可执行性），未写任何项目代码。
- 2026-07-24：完成 v1.2 最终定点修订（D-028~D-035 + D-007R/D-013R），未写任何项目代码。
- 2026-07-24：只读基线检查时修正“下一任务”中的执行方案版本引用（v1.1 → v1.2）；仅为文档引用纠正，不改变基线范围。
- 2026-07-24：Phase 0 通过；完成 Git 基线、最小 MV3 构建、A–D 自动探针、截图坐标与最小权限定稿，并记录 CRXJS/Vite 入口 basename 兼容约束（D-036/D-037）。
- 2026-07-24：Phase 1 通过；数据模型、目录骨架及 storage/messaging/logger 共享库落地，10 项单测通过。
- 2026-07-24：Phase 1.5 通过；凭据隔离、Host 白名单、安全消息路由、脱敏、私有上下文零出站、Prompt 隔离及构建扫描落地，25 项单测通过。

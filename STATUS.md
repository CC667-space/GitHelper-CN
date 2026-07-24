# STATUS.md — 当前进度与状态

> 执行 Agent 每完成一个任务/阶段必须更新本文件。这是断点续跑的依据。

---

## 当前阶段
**规划修订完成（基线 v1.2），尚未开始编码。下一步进入 Phase 0。**

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

## 下一任务
**Phase 0 — 只读基线检查、环境与技术探针**（见 EXECUTION_PLAN v1.2）。
执行 Agent 应从这里开始：
1. 只读基线检查（8 份规划文件齐全一致、目录正确、references/Claude_Prompt.md 就位）
2. Git 初始化 + .gitignore + 规划文件基线提交
3. pnpm + Vite + CRXJS 最小 MV3 扩展
4. 技术探针 A（基础）/ B（截图坐标）/ C（权限复审）/ D（setAccessLevel），结论记入 `scripts/probe-results.md`

## 阶段进度表
| Phase | 状态 |
|---|---|
| 0 基线检查 + 环境 + 技术探针 + Git 初始化 | ⬜ 未开始 |
| 1 仓库结构 + 扩展骨架 | ⬜ |
| 1.5 安全地基 | ⬜ |
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

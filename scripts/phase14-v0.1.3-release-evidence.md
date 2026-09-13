# Phase 14 — GitHub Release `v0.1.3` 验收证据

日期：2026-09-13

## 范围

- 发布渠道：既有公开仓库的 GitHub Release
- 版本：`v0.1.3`
- 内容：D-077 的 Vitest 4.1.11 修复与 Provider 模型候选刷新，以及 D-078 的 GitHub Actions Node 24 运行时迁移
- Chrome Web Store：暂停，不在本轮范围内
- Provider：不调用真实端点，不读取 Chrome 中已保存的 Key
- 权限：不新增 Chrome 权限、Host、Provider、GitHub 写功能或持久数据类别

## 自动门禁

- 项目锁定的 pnpm 11.17.0 frozen install 通过，依赖 store 完整且 lockfile 未变化。
- `pnpm audit --audit-level moderate`：0 项已知漏洞。
- `pnpm notices:generate`：110 个生产依赖、31 组许可证文本；`THIRD_PARTY_NOTICES.txt` 再生成零差异。
- `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`git diff --check`：全部通过。
- `pnpm test`：60 个 test files、327 项测试通过；另 1 个 opt-in live file / 1 项 live test 默认跳过。
- 启用 `GITHUB_LIVE_TEST=1` 后，匿名公开仓库 live test 1/1 通过。
- `pnpm build`：421 modules；产出的 `manifest.json` 版本为 `0.1.3`。
- `pnpm scan:build`：通过；无 `eval`、`new Function` 或远程运行时脚本。
- `pnpm test:e2e`：隔离 Chrome 149 通过；原生 Panel、标签页切换、仓库分析、README 延迟刷新、中文搜索、SPA、会话恢复和敏感哨兵均通过，Provider 请求 0、页面错误 0。
- `pnpm package:extension`：连续执行两次，20 个条目的顺序、时间戳与 SHA-256 一致。
- Action 运行时回归：旧 `@v4` 引用下按预期失败；更新后 5/5 通过。`actions/checkout@v7`、`actions/setup-node@v7` 与 `pnpm/action-setup@v6` 的官方 `action.yml` 均声明 `node24`。

## 发布资产

- `GitHelper-CN-v0.1.3-chrome.zip`：201,567 bytes；20 个条目；SHA-256 `d4f9694eeeeea66754b5796eb9cbda59738d34bc45f18477aee34e1616b96009`。
- `GitHelper-CN-v0.1.3-SHA256SUMS.txt`：97 bytes；SHA-256 `247b43d6fca201f17796085fedf20b191d09d96746522b6d172f9b388c5aa7df`。
- ZIP 内含四档图标、`LICENSE`、`THIRD_PARTY_NOTICES.txt`、Options、Side Panel 与生产脚本；所有条目时间固定为 1980-01-01。
- ZIP 不含 source map、日志、`.env`、凭据命名文件、测试或浏览器 profile。

## 凭据与权限审计

- 当前生产源码、`dist`、本轮新增行与 20 条目发布 ZIP：意外密钥形态命中 0。
- Git 跟踪的 `.env`、私钥/证书、凭据 JSON、`dist`、`artifacts` 或浏览器 profile 路径：0。
- Push 前全部 49 个历史提交中，8 个唯一命中路径全部位于测试或 E2E 安全哨兵；生产路径命中 0。
- 发布版本相对 `v0.1.2` 未新增或扩大 Chrome permissions、host permissions 或 optional host permissions。
- 本轮未读取 Chrome 保存区，也未调用真实 Provider。

## 远程门禁与发布

- 目标仓库：`https://github.com/CC667-space/GitHelper-CN`
- 版本提交：`6caf7f960a87527ad2aac309dd0f67a3120e99b2`；已普通 fast-forward Push 到 `origin/main`。
- Quality workflow：run `34732210407` 成功，verify job `103656954630` 全步骤通过；job annotations 为 `[]`，日志对 `Node.js 20`、`node20` 与强制 Node 24 弃用提示均为 0 命中。地址：`https://github.com/CC667-space/GitHelper-CN/actions/runs/34732210407`。
- CodeQL：run `34732210021` 成功；`Analyze (javascript-typescript)` 与 `Analyze (actions)` 两个 job 均通过。地址：`https://github.com/CC667-space/GitHelper-CN/actions/runs/34732210021`。
- 注释 tag：`v0.1.3`；tag 对象 `8ea493a9650ea3b84b3d8c04aa96f5ba2129ff57` 解引用到版本提交 `6caf7f960a87527ad2aac309dd0f67a3120e99b2`。
- Release：ID `387766263`；公开、非 draft、非 prerelease，并由 `/releases/latest` 返回为当前 latest：`https://github.com/CC667-space/GitHelper-CN/releases/tag/v0.1.3`。
- 远程 ZIP：201,567 bytes；digest `sha256:d4f9694eeeeea66754b5796eb9cbda59738d34bc45f18477aee34e1616b96009`，与本地一致。
- 远程校验文件：97 bytes；digest `sha256:247b43d6fca201f17796085fedf20b191d09d96746522b6d172f9b388c5aa7df`，与本地一致。
- Release 的显式资产只有上述 ZIP 与 SHA-256 文件两项，状态均为 `uploaded`。
- 发布后 GitHub API 复核：Dependabot、Code scanning、Secret scanning 的 open 告警均为 0。
- 状态：GitHub Release `v0.1.3` 发布与远程资产核验完成；Chrome Web Store 继续暂停。

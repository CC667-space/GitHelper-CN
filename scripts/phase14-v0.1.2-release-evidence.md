# Phase 14 — GitHub Release `v0.1.2` 验收证据

日期：2026-08-30

## 范围

- 发布渠道：既有公开仓库的 GitHub Release
- 版本：`v0.1.2`
- 内容：D-074 仓库安全加固 + D-075 分层审计维护 + Windows CI PowerShell 7 入口修复
- Chrome Web Store：暂停，不在本轮范围内
- Provider：不调用真实端点，不读取 Chrome 中已保存的 Key
- 权限：不新增 Chrome 权限或 Host

## 自动门禁

- `pnpm install --frozen-lockfile`：通过；lockfile 389 个条目通过 supply-chain policy 校验，未改动 lockfile。
- `pnpm audit`：0 项已知漏洞。
- `pnpm notices:generate`：110 个生产依赖、31 组许可证文本；`THIRD_PARTY_NOTICES.txt` 再生成零差异。
- `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`git diff --check`：全部通过。
- `pnpm test`：60 个 test files、326 项测试通过；另 1 个 opt-in live file / 1 项 live test 默认跳过。
- 启用 `GITHUB_LIVE_TEST=1` 后，匿名公开仓库 live test 1/1 通过。
- `pnpm build`：421 modules；产出的 `manifest.json` 版本为 `0.1.2`。
- `pnpm scan:build`：通过；无 `eval`、`new Function` 或远程运行时脚本。
- `pnpm test:e2e`：隔离 Chrome 149 通过；页面分析、README 延迟刷新、中文搜索、SPA、会话恢复和敏感哨兵均通过，Provider 请求 0、页面错误 0。
- `pnpm package:extension`：连续执行两次，条目数量和 SHA-256 一致。

## 发布资产

- `GitHelper-CN-v0.1.2-chrome.zip`：201,583 bytes；20 个条目；SHA-256 `bdf18380e112013c7b43352db184f113f46b1e31e2fb15680e772fbe72be276d`。
- `GitHelper-CN-v0.1.2-SHA256SUMS.txt`：97 bytes。
- ZIP 内含四档图标、`LICENSE`、`THIRD_PARTY_NOTICES.txt`、Options、Side Panel 与生产脚本；所有条目时间固定为 1980-01-01。
- ZIP 不含 source map、日志、`.env`、凭据命名文件、测试或浏览器 profile。

## 凭据审计

- 当前生产源码：密钥形态命中 0。
- `dist`：密钥形态命中 0。
- 20 条目发布 ZIP：密钥形态命中 0。
- Git 跟踪的 `.env`、私钥/证书、凭据 JSON、`dist`、`artifacts` 或浏览器 profile 路径：0。
- 全部 45 个历史提交：11 个命中路径全部位于测试或 E2E 脚本中的显式安全哨兵；生产路径命中 0。
- 本轮未读取 Chrome 保存区，也未调用真实 Provider。

## 远程发布

- 目标仓库：`https://github.com/CC667-space/GitHelper-CN`
- 目标 Release：`https://github.com/CC667-space/GitHelper-CN/releases/tag/v0.1.2`
- 状态：本地发布门禁已通过；待创建版本提交并 Push，版本提交的 Quality workflow 成功后再创建 tag、Release 并核验远程资产。

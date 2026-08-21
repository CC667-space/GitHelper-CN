# Phase 14 — GitHub Release `v0.1.0` 验收证据

日期：2026-08-21

## 范围

- 发布渠道：既有公开仓库的 GitHub Release
- 版本：`v0.1.0`
- Chrome Web Store：暂停，不在本阶段范围内
- Provider：不调用真实端点，不读取 Chrome 中已保存的 Key

## 正式运行时加固

- Background 不再注册 Phase 0 原始消息或截图校准处理器。
- Content Script 不再创建 GitHub 页面隐藏触发按钮。
- Options 不再显示“本地技术验证”或批量真实能力探针；每个 Provider 的“测试 Key 与模型”保留。
- manifest/action 引用随包提供的 16/32/48/128 四档图标，未新增权限或 Host。

## 自动门禁

- `pnpm typecheck`：通过。
- `pnpm lint`：通过。
- 变更源文件 Prettier check：通过。
- `git diff --check`：通过。
- 两份 PowerShell 发布脚本语法解析：通过。
- `pnpm test`：55 个 test files 通过、1 个 live test file 跳过；303 项测试通过、1 项跳过。
- `pnpm build`：通过，Vite 转换 419 modules。
- `pnpm scan:build`：通过；未发现 `eval`、`new Function` 或远程运行时脚本。
- `pnpm test:e2e`：Chrome for Testing 149 通过；真实快捷键打开原生 Side Panel，`onOpened/onClosed` 生命周期、分析、搜索、SPA、Session 和敏感哨兵遮蔽均通过；Provider 请求 0，页面异常 0。
- `pnpm package:extension`：通过；ZIP 共 17 个条目。

## 发布资产

- `artifacts\GitHelper-CN-v0.1.0-chrome.zip`
- `artifacts\GitHelper-CN-v0.1.0-SHA256SUMS.txt`
- ZIP SHA-256：`6d3e65fd8d95a654aa128c9d2ddc980aebe45a7e2cce6f61e1f7f724dd6070c3`

## 凭据审计

- 当前生产工作区（排除测试哨兵）、`dist` 与 ZIP：已知 API Key、GitHub Token、Google Key、私钥头模式命中 0。
- 现有全部 Git 历史快照的非测试路径：上述已知凭据模式命中 0。
- Git 历史与当前跟踪文件：`.env`、私钥/证书、凭据 JSON、浏览器 profile、`dist`、`artifacts` 等禁止路径命中 0。
- 测试与 E2E 中存在的 `sk-*` / `github_pat_*` / `AIza*` 值均为显式虚构哨兵，用于验证遮蔽与泄漏防护，不是 Provider Key。

## 远程发布

- 目标仓库：`https://github.com/CC667-space/GitHelper-CN`
- 目标 Release：`https://github.com/CC667-space/GitHelper-CN/releases/tag/v0.1.0`
- 提交：`763063edf56b40723ff9743271636661a1ebd4cc`
- tag：`v0.1.0`，远程解引用后指向上述提交。
- Release 状态：公开、非 draft、非 prerelease。
- 远程资产：仅 `GitHelper-CN-v0.1.0-chrome.zip`（189,257 bytes）与 `GitHelper-CN-v0.1.0-SHA256SUMS.txt`（97 bytes）。
- GitHub ZIP digest：`sha256:6d3e65fd8d95a654aa128c9d2ddc980aebe45a7e2cce6f61e1f7f724dd6070c3`，与本地一致。
- GitHub 校验文件 digest：`sha256:758b7ff0c26ccf8a5ca706b48762b72d1fcf9ef50b228d374182105da1ffb24e`，与本地一致。
- 状态：远程 tag、Release 与两项资产均已核验，Phase 14 完成。

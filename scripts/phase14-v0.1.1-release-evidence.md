# Phase 14 — GitHub Release `v0.1.1` 验收证据

日期：2026-08-21

## 范围

- 发布渠道：既有公开仓库的 GitHub Release
- 版本：`v0.1.1`
- 内容：D-071 当前页面问答上下文修复 + D-072 字号与中文搜索连续性优化
- Chrome Web Store：暂停，不在本轮范围内
- Provider：不调用真实端点，不读取 Chrome 中已保存的 Key
- 权限：不新增 Chrome 权限或 Host

## 自动门禁

- `pnpm typecheck`：通过。
- `pnpm lint`：通过。
- 变更源码与本轮新增发布文件 Prettier check：通过。
- `git diff --check`：通过。
- `scripts/package-extension.ps1` 与 `scripts/generate-extension-icons.ps1` PowerShell 语法解析：通过。
- `pnpm test`：58 个 test files 通过、1 个 live test file 跳过；316 项测试通过、1 项跳过。
- `pnpm build`：通过，Vite 转换 421 modules；`dist/manifest.json` 版本为 `0.1.1`，权限/Host 清单未扩大。
- `pnpm scan:build`：通过；未发现 `eval`、`new Function` 或远程运行时脚本。
- `pnpm test:e2e`：隔离 Chrome for Testing 149 通过；原生 Panel 打开/切换标签关闭、README 延迟刷新、仓库分析、搜索、SPA、Session 与敏感哨兵遮蔽均通过；Provider 请求 0，页面异常 0。
- `pnpm package:extension`：通过；ZIP 共 18 个条目。

## 发布资产

- `artifacts\GitHelper-CN-v0.1.1-chrome.zip`
- `artifacts\GitHelper-CN-v0.1.1-SHA256SUMS.txt`
- ZIP：191,643 bytes。
- 校验文件：97 bytes。
- ZIP SHA-256：`eb6c12fb5c3554136e6958b3480a950ebfb1119c5bdf387102bfa6042e50b84b`。

## 凭据审计

- 当前生产工作区（排除测试哨兵）、`dist` 与 ZIP：已知 API Key、GitHub Token、Google Key、私钥头及常见字面量赋值模式意外命中 0。
- 全部现有 Git 历史的非测试路径：意外凭据模式命中 0；历史与当前跟踪文件的 `.env`、私钥/证书、凭据目录、浏览器 profile、`dist`、`artifacts` 等禁止路径命中 0。
- `scripts/run-phase11-e2e.mjs` 当前与历史中的唯一前缀命中已逐项确认为同一个显式虚构安全哨兵；意外值 0。测试与 E2E 哨兵只用于验证遮蔽，不是 Provider Key。

## 远程发布

- 目标仓库：`https://github.com/CC667-space/GitHelper-CN`
- 目标 Release：`https://github.com/CC667-space/GitHelper-CN/releases/tag/v0.1.1`
- 状态：待本地发布验收通过后创建并核验远程 tag、Release 与两项资产。

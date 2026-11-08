# Phase 14 — GitHub Release `v0.1.5` 验收证据

日期：2026-11-08

## 范围

- 发布渠道：既有公开仓库的 GitHub Release
- 版本：`v0.1.5`
- 内容：D-082 的依赖安全维护、Provider 当前/低价候选刷新与 Kimi 固定采样参数兼容
- Chrome Web Store：暂停，不在本轮范围内
- Provider：执行 Agent 不读取 Chrome 中已保存的 Key，不主动调用真实端点
- 权限：不新增 Chrome 权限、Host、Provider、GitHub 写功能或持久数据类别

## 配置与真实能力边界

- 已保存 Key、Model ID 与 custom URL 不读取、不迁移、不覆盖；仅升级扩展不会使未变化的探针绑定失效。
- Catalog 候选仅用于便捷填写，不代表用户账号具有权限，也不代替单 Provider 的真实能力探针。
- 本轮不要求用户重复测试未变化且已验证的 Provider；新候选仅在用户主动选择后按需测试。

## 自动门禁

- `CI=true pnpm install --frozen-lockfile` 通过；锁文件无变化，supply-chain policy 检查通过。
- `pnpm audit --audit-level moderate --json`：384 项依赖，0 项已知漏洞。
- `pnpm notices:generate`：110 个生产依赖、31 组许可证文本；`THIRD_PARTY_NOTICES.txt` 再生成零差异。
- `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`git diff --check`：全部通过。
- `pnpm test`：60 个 test files、328 项测试通过；另 1 个 opt-in live file / 1 项 live test 默认跳过。
- 启用 `GITHUB_LIVE_TEST=1` 后，匿名公开仓库 live test 1/1 通过。
- `pnpm build`：437 modules；产出的 `manifest.json` 版本为 `0.1.5`。
- `pnpm scan:build`：通过；无 `eval`、`new Function` 或远程运行时脚本。
- `pnpm test:e2e`：隔离 Chrome 149 通过；原生 Panel、标签页切换、仓库分析、README 延迟刷新、中文搜索、SPA、会话恢复和敏感哨兵均通过，Provider 请求 0、页面错误 0。
- `pnpm package:extension`：连续执行两次，20 个条目的顺序、固定时间戳、大小与 SHA-256 一致。

## 发布资产

- `GitHelper-CN-v0.1.5-chrome.zip`：208,287 bytes；20 个条目；SHA-256 `eebb6f7bef98c6fbe608d301cbaa826c8d8313865dc2bee0e834c43ca38e77c7`。
- `GitHelper-CN-v0.1.5-SHA256SUMS.txt`：97 bytes；SHA-256 `366369e490742971c5cb621041124829df3323657eba69849e0e77d882185195`。
- ZIP 内含四档图标、`LICENSE`、`THIRD_PARTY_NOTICES.txt`、Options、Side Panel 与生产脚本；所有条目使用固定的 1980-01-01 00:00:00 ZIP 本地时间。
- ZIP 不含 source map、日志、`.env`、凭据命名文件、测试或浏览器 profile。

## 凭据与权限审计

- 当前生产源码、本轮新增行、`dist` 与 20 条目发布 ZIP：意外密钥形态命中 0。
- Git 跟踪的 `.env`、私钥/证书、凭据文件、`dist`、`artifacts` 或浏览器 profile 路径：0。
- 全部 Git 历史中的 8 个唯一命中路径均位于测试或 E2E 安全哨兵；生产路径命中 0。
- 发布版本相对 `v0.1.4` 仅修改 manifest 版本号，未新增或扩大 Chrome permissions、host permissions 或 optional host permissions。
- 本轮未读取 Chrome 保存区；未调用任何真实 Provider。

## 远程门禁与发布

- 待版本提交 Push、Quality/CodeQL、tag、Release、资产 digest 与安全告警复核完成后填写。

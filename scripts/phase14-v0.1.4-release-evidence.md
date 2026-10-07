# Phase 14 — GitHub Release `v0.1.4` 验收证据

日期：2026-10-07

## 范围

- 发布渠道：既有公开仓库的 GitHub Release
- 版本：`v0.1.4`
- 内容：D-080 的模型目录新增/淘汰/低价保留维护、DeepSeek Flash 文本/视觉候选与开发依赖公告修复
- Chrome Web Store：暂停，不在本轮范围内
- Provider：执行 Agent 不读取 Chrome 中已保存的 Key，不主动调用真实端点
- 权限：不新增 Chrome 权限、Host、Provider、GitHub 写功能或持久数据类别

## 真实能力确认

- 项目负责人于 2026-10-07 在当前构建的 Options 页面人工确认 DeepSeek `deepseek-flash`：文本已验证、视觉已验证，Provider 状态为 `available`。
- 该证据不包含、也未向执行 Agent 暴露真实 Key；其他绑定值未变化的已验证 Provider 不因本版发布被强制重新探针。

## 自动门禁

- frozen-lockfile 安装通过，锁文件未变化；389 项依赖的 supply-chain policy 检查通过。
- `pnpm audit --audit-level moderate --json`：0 项已知漏洞。
- `pnpm notices:generate`：110 个生产依赖、31 组许可证文本；`THIRD_PARTY_NOTICES.txt` 再生成零差异。
- `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`git diff --check`：全部通过。
- `pnpm test`：60 个 test files、327 项测试通过；另 1 个 opt-in live file / 1 项 live test 默认跳过。
- 启用 `GITHUB_LIVE_TEST=1` 后，匿名公开仓库 live test 1/1 通过。
- `pnpm build`：421 modules；产出的 `manifest.json` 版本为 `0.1.4`。
- `pnpm scan:build`：通过；无 `eval`、`new Function` 或远程运行时脚本。
- `pnpm test:e2e`：隔离 Chrome 149 通过；原生 Panel、标签页切换、仓库分析、README 延迟刷新、中文搜索、SPA、会话恢复和敏感哨兵均通过，Provider 请求 0、页面错误 0。
- `pnpm package:extension`：连续执行两次，20 个条目的顺序、固定时间戳、大小与 SHA-256 一致。

## 发布资产

- `GitHelper-CN-v0.1.4-chrome.zip`：201,496 bytes；20 个条目；SHA-256 `19df37d6ec0f0b15370e740b7346f417dcd99a25a8231e1542badedd5680e4d3`。
- `GitHelper-CN-v0.1.4-SHA256SUMS.txt`：97 bytes；SHA-256 `f140844b4f3631d0e4750ec8e3fa12e4b9f773875d5e7967c1b4c0d9e1c97162`。
- ZIP 内含四档图标、`LICENSE`、`THIRD_PARTY_NOTICES.txt`、Options、Side Panel 与生产脚本；所有条目时间固定为 1980-01-01 00:00:00。
- ZIP 不含 source map、日志、`.env`、凭据命名文件、测试或浏览器 profile。

## 凭据与权限审计

- 当前生产源码、本轮新增行、`dist` 与 20 条目发布 ZIP：意外密钥形态命中 0。
- Git 跟踪的 `.env`、私钥/证书、凭据文件、`dist`、`artifacts` 或浏览器 profile 路径：0。
- 全部 Git 历史中的 8 个唯一命中路径均位于测试或 E2E 安全哨兵；生产路径命中 0。
- 发布版本相对 `v0.1.3` 仅修改 manifest 版本号，未新增或扩大 Chrome permissions、host permissions 或 optional host permissions。
- 本轮未读取 Chrome 保存区；真实探针结果只采用项目负责人提供的状态证据。

## 远程门禁与发布

- 目标仓库：`https://github.com/CC667-space/GitHelper-CN`
- 版本提交：`8a33e4bedf123e56c4b165a2b9fe5ca6c69ec03a`；已普通 fast-forward Push 到 `origin/main`。
- Quality workflow：run `37597902173` 成功，verify job `112714891865` 全步骤通过，job annotations 为 `[]`。地址：`https://github.com/CC667-space/GitHelper-CN/actions/runs/37597902173`。
- CodeQL：run `37597901376` 成功；`Analyze (javascript-typescript)` 与 `Analyze (actions)` 两个 job 均通过。地址：`https://github.com/CC667-space/GitHelper-CN/actions/runs/37597901376`。
- 注释 tag：`v0.1.4`；tag 对象 `5d952003b681062e9cf2dd4029cc5a87dcf28827` 解引用到版本提交 `8a33e4bedf123e56c4b165a2b9fe5ca6c69ec03a`。
- Release：ID `405577165`；公开、非 draft、非 prerelease，并由 `/releases/latest` 返回为当前 latest：`https://github.com/CC667-space/GitHelper-CN/releases/tag/v0.1.4`。
- 远程 ZIP：201,496 bytes；digest `sha256:19df37d6ec0f0b15370e740b7346f417dcd99a25a8231e1542badedd5680e4d3`，与本地一致。
- 远程校验文件：97 bytes；digest `sha256:f140844b4f3631d0e4750ec8e3fa12e4b9f773875d5e7967c1b4c0d9e1c97162`，与本地一致。
- Release 的显式资产只有上述 ZIP 与 SHA-256 文件两项，状态均为 `uploaded`。
- 发布后 GitHub API 复核：Dependabot、Code scanning、Secret scanning 的 open 告警均为 0。
- 状态：GitHub Release `v0.1.4` 发布与远程资产核验完成；Chrome Web Store 继续暂停。

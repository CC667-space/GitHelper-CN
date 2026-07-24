# Phase 9 真实公开仓库匿名分析证据

日期：2026-07-24  
范围：只读、匿名 GitHub REST API；未使用 GitHub Token，未调用 AI Provider，未执行远端写操作。

## 执行方式

```powershell
$env:GITHUB_LIVE_TEST='1'
pnpm exec vitest run tests/integration/public-repository-analysis.live.test.ts
```

## 结果

- `react/react`：固定分析卡生成通过；Star 为数值、语言列表非空、归档状态明确。
- `microsoft/vscode`：固定分析卡生成通过；Star 为数值、语言列表非空、归档状态明确。
- `rust-lang/rust`：固定分析卡生成通过；Star 为数值、语言列表非空、归档状态明确。
- 真实测试：1 file / 1 test passed。
- 未命中匿名 `core` 限流，未触发 GitHub Token 基线变更节点。

## 发现与修正

首次使用历史名称 `facebook/react` 时，GitHub API 返回 canonical repository
`react/react`。实现已改为以 API 的 `full_name` 与 `html_url` 回填卡片，并增加
“旧名称输入 → canonical 名称/URL”回归测试。第二次真实测试使用 `react/react`
后，三个仓库全部通过。

## 常规全量验证

常规 `pnpm test` 默认跳过真实网络用例，避免 CI/离线环境消耗匿名配额：

- 40 files passed / 1 live file skipped
- 143 tests passed / 1 live test skipped
- typecheck、lint、build（404 modules）与构建安全扫描通过

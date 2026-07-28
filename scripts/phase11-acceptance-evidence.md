# Phase 11 自动验收证据

> 日期：2026-07-28
>
> 状态：自动验收及前四轮人工问题补丁已通过；真实 Chrome 的 S1–S5 批量体验复核仍待用户完成。

## 自动门禁

| 门禁                     | 结果                                                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest                   | 45 个文件通过、1 个 opt-in live 文件默认跳过；204 项通过、1 项跳过                                                                                         |
| TypeScript               | `pnpm typecheck` 通过                                                                                                                                      |
| ESLint                   | `pnpm lint` 通过                                                                                                                                           |
| Production build         | `pnpm build` 通过，406 modules transformed                                                                                                                 |
| Build safety             | `pnpm scan:build` 通过；无 eval/new Function/远程运行时脚本                                                                                                |
| Playwright extension E2E | 通过；Chrome for Testing 149，隔离临时 profile，Provider 请求 0                                                                                            |
| Package                  | `artifacts\GitHelper-CN-v0.1.0.zip`，13 entries，根目录 `manifest.json` 已校验；SHA-256 `0adbe7ddf37d4583c846dffc556c746c11b42d5ab567aca90e85ff2d37f53d80` |

Phase 9 的三仓库匿名 live test 默认不进入常规 `pnpm test`，但已在 Phase 9 独立真实运行通过，证据见 `scripts/phase9-live-evidence.md`。

## Playwright E2E

命令：

```powershell
pnpm test:e2e
```

结果：

```json
{
  "status": "passed",
  "nativeSidePanelOpenResolved": true,
  "nativePanelExposedToPlaywright": false,
  "automatedPanelSurface": "same-extension-panel-document",
  "s1RepositoryAnalysis": {
    "repository": "octocat/Hello-World",
    "apiFacts": ["stars", "license", "release", "openPullRequests"],
    "fileEvidence": ["README.md", "package.json", "src/server.js"],
    "defaultVisible": ["readmeSummary", "features", "configuration", "implementation"],
    "factsDefaultExpanded": false
  },
  "spa": {
    "pageType": "issue",
    "issueOrPrNumber": 42,
    "contentScriptInstances": 1
  },
  "sessionRestore": {
    "persisted": true,
    "restoredAfterPanelReload": true,
    "survivedPageSwitch": true
  },
  "s5SensitiveSentinel": {
    "persistedPlaintext": false,
    "restoredPlaintext": false,
    "redactionMarker": "‹REDACTED:API_KEY›"
  },
  "providerRequests": 0,
  "pageErrors": []
}
```

边界说明：Options 页真实用户点击调用 `chrome.sidePanel.open()` 成功；当前 Chrome for Testing 不把原生 Side Panel target 暴露为 Playwright `Page`。自动 DOM 交互因此使用同一扩展进程、同一生产 bundle 的 Panel 文档；Background、Content、匿名 API、storage 与消息链均为真实代码。原生 Side Panel 的打开与页面内交互最终由本阶段唯一人工批量复核确认。

## S1–S5 证据映射

| 成功标准            | 自动证据                                                                                                                                                                                                                                    | 结论                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| S1 公开仓库一键分析 | `tests/unit/github-api.test.ts`、`tests/unit/repository-analysis.test.ts`、`tests/unit/repository-provider.test.ts`、`tests/integration/panel-roundtrip.test.ts`、`tests/unit/phase9-ui.test.tsx`、`tests/integration/public-repository-analysis.live.test.ts`、Phase 11 E2E | 三个真实公开仓库已在 Phase 9 通过；多语言 README 去重、根级说明优先、详情大小复核、HTML banner/功能表清洗提取、Provider 部分结果合并与未知事实丢弃全过；E2E 默认显示无乱码的 README/功能/配置/实现及 `package.json` / `src/server.js`，事实区默认关闭且展开后数字可见 |
| S2 点击/框选提问    | `tests/unit/pick.test.ts`、`tests/unit/region.test.ts`、`tests/unit/capture.test.ts`、`tests/integration/panel-roundtrip.test.ts`、Phase 6/7 UI 测试                                                                                        | 点击结构、框选结构、文本/视觉分路、错页与偏好护栏全过；选择后下一步 CTA 可聚焦输入框             |
| S3 NL→搜索          | `tests/unit/search-query.test.ts`、`tests/unit/search-executor.test.ts`、`tests/unit/github-api.test.ts`、Phase 8 UI/集成测试                                                                                                               | 7 组转换（≥5），仓库/Issue 结果、限流零重试和 DOM/网页降级全过                                 |
| S4 会话保存恢复     | `tests/unit/session-store.test.ts`、`tests/unit/active-session-store.test.ts`、`tests/unit/panel-connection.test.ts`、Phase 5 UI/集成测试、Phase 11 E2E                                                                                       | CRUD、显式选择/新建、逐轮收展、问答/session 二次确认删除、活动指针、过期/容量淘汰、断线重连、跨页面与 Panel 重载恢复全过 |
| S5 敏感信息遮蔽     | `tests/unit/sanitizer.test.ts`、`tests/unit/logger.test.ts`、`tests/unit/router.test.ts`、`tests/security/leakage.test.ts`、`tests/security/private-zero-out.test.ts`、Phase 11 E2E                                                         | 实际 Provider 请求体、日志、普通消息、Session 持久化、Panel 重载与私有页面出口均无测试哨兵明文 |

## 人工复核入口

加载最新 `dist/`，按 `docs/USER_GUIDE.md` 第 9 节依次完成 S1–S5，并复核多语言 README 不再挤出配置/源码、README/功能/配置/实现速览无 banner HTML 或 `�`、仓库事实默认折叠、逐轮折叠、两类 `🗑 → ✓/×`、精炼回答、代码块与选择后 CTA。S5 只使用测试哨兵，禁止粘贴真实 Key。

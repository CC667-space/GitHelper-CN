# Phase 0 技术探针结果

> 状态：**A–D 全部通过**  
> 执行时间：2026-07-24 14:51（Asia/Shanghai）  
> 目标页：`https://github.com/openai/openai-node`（公开仓库真实页面）

## 环境与方法

- 本机正式 Chrome：150.0.7871.129。该版本不再接受命令行侧载未打包扩展，故自动探针使用项目锁定的 Playwright Core 1.61.1 配套 Chrome for Testing 149.0.7827.55；临时 profile 与浏览器文件均在 `probe-artifacts/`（Git 忽略）内。
- Windows 高 DPI：启动参数模拟 device scale factor 1.5。
- 浏览器缩放：通过 `chrome.tabs.setZoom(tabId, 1.25)` 明确设为 125%，并用 `getZoom()` 回读为 1.25。
- 页面滚动：`scrollY = 914.1333618164062`。
- Side Panel 保持开启；开启后、125% 缩放下页面 viewport 为 `832 × 718 CSS px`。
- 截图由 Background Service Worker 调用 `chrome.tabs.captureVisibleTab()`；未落盘，仅在内存中解码校验。

## 探针 A — 基础链路：通过

- Options 页真实按钮手势调用 `chrome.sidePanel.open()` 成功，Windows UI Automation 同时识别到 Side Panel 文档 `GitHelper-CN` 和“关闭侧边栏”控件。
- 静态 `content_scripts` 在真实 `github.com` 页面成功注入。
- Background 读到活动标签页 URL：`https://github.com/openai/openai-node`。
- 构建后的 `manifest.json` 声明 `minimum_chrome_version: "114"`。

## 探针 B — 截图坐标：通过并定稿

实测截图：`1560 × 1347 px`；页面 viewport：`832 × 718 CSS px`。

最终换算：

```ts
const scaleX = capturedWidth / viewport.cssWidth;
const scaleY = capturedHeight / viewport.cssHeight;

const pixelRect = {
  x: Math.round(rect.x * scaleX),
  y: Math.round(rect.y * scaleY),
  width: Math.round(rect.width * scaleX),
  height: Math.round(rect.height * scaleY),
};
```

- 本次 `scaleX = 1.875`，`scaleY = 1.8760445682451254`；X/Y 必须分别按实际尺寸计算，不能假定完全相等。
- `devicePixelRatio = 1.875`（1.5× DPI 与 125% zoom 的组合值），与比例法基本一致；截图高度的像素取整使 `scaleY` 有微小差异，证明“截图实际尺寸 ÷ viewport CSS 尺寸”比直接推导 `dpr × zoom` 更稳健。
- `rect` 来自 `getBoundingClientRect()`，是视口坐标：**不扣除 scroll**，也**不做 GitHub 固定页头补偿**。
- 实现裁剪时须把最终矩形 clamp 到截图边界；宽高为 0 时拒绝裁剪。

三处真实页面位置的 24 CSS px 校准标记均像素级对齐：

| 位置 | 实际页面元素 | 预期截图矩形 | 实测截图矩形 | 结果 |
|---|---|---:|---:|---|
| 顶部/固定区域 | `a`：`CHANGELOG.md` | `(185,31,45,45)` | `(185,31,45,45)` | 通过 |
| 中部 | `div`：`Jun 25, 2026` | `(876,639,45,45)` | `(876,639,45,45)` | 通过 |
| 底部边缘 | `div`：About 区域 | `(1260,1298,45,45)` | `(1260,1298,45,45)` | 通过 |

## 探针 C — 权限复审：通过

最终 v1 权限：

- API 权限：`sidePanel`、`storage`、`activeTab`
- Host：`github.com`、`api.github.com`、`api.deepseek.com`、`uuapi.net`、`openrouter.ai`（五域闭合）
- **不申请** `tabs`
- **不申请** `scripting`
- **不申请** `<all_urls>`

证据：

- 扩展 action 用户手势授予 `activeTab` 后，SW 的 `captureVisibleTab()` 成功。
- 静态 `content_scripts` 已覆盖 GitHub 页面，无需动态注入。
- 活动 tab URL 可从 action sender / 已校验的 Content 响应取得，无需 `tabs` 权限。

## 探针 D — Storage 访问级：通过

Background 启动执行：

```ts
chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
```

Content Script 尝试读取带 sentinel 的 `chrome.storage.local` 时被拒，真实错误为：

```text
Access to storage is not allowed from this context.
```

`credentialSentinelVisible = false`，证明 Content Script 无法读取受限 storage。

## 构建兼容结论

- CRXJS 2.7.1 + Vite 8.1.5 下，MV3 Background 与 Content 入口不能同时使用相同 basename `index.ts`，否则 `service-worker-loader.js` 会因产物名碰撞错误指向 Content bundle。入口定为 `service-worker.ts` / `content-script.ts`。
- 当前组合下 Content Script 开启 sourcemap 会把 IIFE 尾部拼到 `sourceMappingURL` 注释后形成语法错误；Phase 0 将生产 build 的 sourcemap 关闭。
- 上述均为构建兼容实现约束，不扩大权限或产品范围。

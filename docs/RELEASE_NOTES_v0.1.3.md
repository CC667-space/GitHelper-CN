# GitHelper-CN v0.1.3

这是在 v0.1.2 基础上的小型维护版本，集中发布已通过自动门禁和人工确认的 Provider 模型目录刷新，并修复 Vitest 开发依赖公告和 GitHub Actions 的 Node.js 20 弃用警告。未新增 Chrome 权限、Host、Provider、GitHub 写操作或持久数据类别。

## 安装与更新

1. 在本 Release 的 Assets 下载 `GitHelper-CN-v0.1.3-chrome.zip`，不要下载 `Source code (zip)` 代替扩展包。
2. 可用同一 Release 的 `GitHelper-CN-v0.1.3-SHA256SUMS.txt` 校验 ZIP。
3. 首次安装：把 ZIP 解压到固定目录，再从 `chrome://extensions/` 以开发者模式“加载已解压的扩展程序”。
4. 从旧版更新：关闭 Side Panel，清空原解压目录中的旧扩展文件，把新 ZIP 完整解压到同一路径，然后在扩展卡片点击“重新加载”。不要先移除扩展，除非接受本地会话、偏好和已保存 Key 可能被清除。

完整步骤见仓库 [README](https://github.com/CC667-space/GitHelper-CN#readme) 与 [用户指南](https://github.com/CC667-space/GitHelper-CN/blob/main/docs/USER_GUIDE.md)。

## 本版更新

- 将 `vitest` 从 4.1.10 定向更新到 4.1.11，修复对应的开发服务器路径穿越/本地文件读取公告；不升级测试框架主版本。
- Provider 模型候选核对日期更新为 2026-09-13，并定向刷新 OpenAI、Anthropic、Gemini、Qwen、SiliconFlow 与 Grok 的便捷默认值和候选值；模型列表已完成人工确认。
- 已保存的 Model ID 始终优先，不会因目录更新而被覆盖；用户仍可自行填写账号实际可用的 Model ID。
- GitHub Quality workflow 将 `actions/checkout`、`actions/setup-node` 与 `pnpm/action-setup` 更新到声明 Node 24 运行时的稳定主版本，消除 Node.js 20 弃用警告；既有质量步骤保持不变。

## 升级后需要注意

- 本版不会读取、迁移或删除已保存 Key，也不会自动运行真实 Provider 探针。
- 模型候选只是便捷预设，不表示账号一定具有权限，真实可用性仍以卡内“测试 Key 与模型”为准；该测试可能产生少量 Provider 费用。
- 从 v0.1.1 或更早版本升级时，v0.1.2 引入的探针新鲜度校验仍可能使旧状态显示为“未验证”，但不会删除已保存 Key。
- 这不是 Chrome Web Store 安装；仍需开发者模式加载解压目录。
- 仅支持公开 GitHub 页面，不支持 GitHub Token、私有仓库或 GitHub 写操作。
- Chrome Web Store 上架继续暂停，不在本版本范围内。

# GitHelper-CN v0.1.4

这是在 v0.1.3 基础上的小型维护版本，只发布已完成自动门禁和真实能力确认的模型目录与开发依赖维护。未新增 Chrome 权限、Host、Provider、GitHub 写操作或持久数据类别。

## 安装与更新

1. 在本 Release 的 Assets 下载 `GitHelper-CN-v0.1.4-chrome.zip`，不要下载 `Source code (zip)` 代替扩展包。
2. 可用同一 Release 的 `GitHelper-CN-v0.1.4-SHA256SUMS.txt` 校验 ZIP。
3. 首次安装：把 ZIP 解压到固定目录，再从 `chrome://extensions/` 以开发者模式“加载已解压的扩展程序”。
4. 从旧版更新：关闭 Side Panel，清空原解压目录中的旧扩展文件，把新 ZIP 完整解压到同一路径，然后在扩展卡片点击“重新加载”。不要先移除扩展，除非接受本地会话、偏好和已保存 Key 可能被清除。

完整步骤见仓库 [README](https://github.com/CC667-space/GitHelper-CN#readme) 与 [用户指南](https://github.com/CC667-space/GitHelper-CN/blob/main/docs/USER_GUIDE.md)。

## 本版更新

- Provider 模型候选按“加入当前模型、移出新配置中的过时模型、保留低价模型”维护 OpenAI、Anthropic、DeepSeek 与 Qwen；Gemini、Kimi、Grok、OpenRouter 保持既有候选，GLM 与 SiliconFlow 未在证据不足时猜测更新。
- DeepSeek 新配置默认使用低价 `deepseek-flash`，并允许在视觉 Model 卡片选择该模型；`deepseek-v4-pro` 继续作为文本候选，已停用的 `deepseek-chat` / `deepseek-reasoner` 仍被拒绝。
- 已保存的 Model ID 始终优先，不会因目录更新而被覆盖；用户仍可自行填写账号实际可用的 Model ID。
- 开发/构建依赖锁更新到已修复版本：`brace-expansion` 5.0.12、`source-map-js` 1.2.2、`undici` 7.30.0。

## 升级后需要注意

- 本版不会读取、迁移或删除已保存 Key，也不会自动运行真实 Provider 探针。
- 只有实际修改 Key、文本/视觉 Model ID 或 custom URL 时，对应旧探针状态才会失效；未变化且已验证的 Provider 无需仅因升级而重复测试。
- 项目负责人已在发布前人工确认当前构建中的 DeepSeek `deepseek-flash` 文本与视觉探针均通过；其他模型的可用性仍取决于用户账号权限和真实探针。
- 模型候选只是便捷预设，不表示账号一定具有权限；“测试 Key 与模型”可能产生少量 Provider 费用。
- 这不是 Chrome Web Store 安装；仍需开发者模式加载解压目录。
- 仅支持公开 GitHub 页面，不支持 GitHub Token、私有仓库或 GitHub 写操作。
- Chrome Web Store 上架继续暂停，不在本版本范围内。

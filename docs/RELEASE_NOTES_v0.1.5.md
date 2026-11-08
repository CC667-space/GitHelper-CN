# GitHelper-CN v0.1.5

这是在 v0.1.4 基础上的小型维护版本，只发布已经完成本地自动门禁的依赖安全维护、Provider 便捷模型候选刷新和 Kimi 请求兼容修复。未新增 Chrome 权限、Host、Provider、GitHub 写操作或持久数据类别。

## 安装与更新

1. 在本 Release 的 Assets 下载 `GitHelper-CN-v0.1.5-chrome.zip`，不要下载 `Source code (zip)` 代替扩展包。
2. 可用同一 Release 的 `GitHelper-CN-v0.1.5-SHA256SUMS.txt` 校验 ZIP。
3. 首次安装：把 ZIP 解压到固定目录，再从 `chrome://extensions/` 以开发者模式“加载已解压的扩展程序”。
4. 从旧版更新：关闭 Side Panel，清空原解压目录中的旧扩展文件，把新 ZIP 完整解压到同一路径，然后在扩展卡片点击“重新加载”。不要先移除扩展，除非接受本地会话、偏好和已保存 Key 可能被清除。

完整步骤见仓库 [README](https://github.com/CC667-space/GitHelper-CN#readme) 与 [用户指南](https://github.com/CC667-space/GitHelper-CN/blob/main/docs/USER_GUIDE.md)。

## 本版更新

- Anthropic、SiliconFlow、GLM、Kimi 与 Grok 的便捷候选按当前型号与低价路线刷新；OpenAI、DeepSeek、Gemini、Qwen 与 OpenRouter 保持原候选。
- Kimi 请求不再注入通用 `temperature`，避免固定采样模型拒绝仓库分析、问答、搜索转换或能力探针请求。
- 更新同主版本或补丁版本依赖并清除当前已知依赖安全公告；未进行 React、TypeScript、Vitest、CRXJS 等主版本迁移。
- 已保存的 Model ID 始终优先，不会因目录更新而被覆盖；用户仍可自行填写账号实际可用的 Model ID。

## 升级后需要注意

- 本版不会读取、迁移或删除已保存 Key，也不会自动运行真实 Provider 探针。
- 仅升级扩展不会强制重测未变化的 Provider。只有实际修改 Key、文本/视觉 Model ID 或 custom URL 时，对应旧探针状态才会失效。
- 模型候选只是便捷预设，不表示账号一定具有权限；新候选的最终可用性以账号权限和“测试 Key 与模型”结果为准，测试可能产生少量 Provider 费用。
- 这不是 Chrome Web Store 安装；仍需开发者模式加载解压目录。
- 仅支持公开 GitHub 页面，不支持 GitHub Token、私有仓库或 GitHub 写操作。
- Chrome Web Store 上架继续暂停，不在本版本范围内。

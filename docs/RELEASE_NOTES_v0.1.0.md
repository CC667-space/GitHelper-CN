# GitHelper-CN v0.1.0

首个公开 GitHub Release。该版本是面向中文 GitHub 新手的本地 BYOK Chrome Side Panel 助手。

## 安装

1. 在本 Release 的 Assets 下载 `GitHelper-CN-v0.1.0-chrome.zip`，不要下载 `Source code (zip)` 代替扩展包。
2. 可用同一 Release 的 `GitHelper-CN-v0.1.0-SHA256SUMS.txt` 校验 ZIP。
3. 把 ZIP 解压到固定目录；目录根应直接包含 `manifest.json`。
4. 打开 `chrome://extensions/`，启用“开发者模式”，点击“加载已解压的扩展程序”并选择该目录。
5. 在扩展 Options 页配置文本 Provider、Model ID 与 API Key，点击“测试 Key 与模型”。
6. 打开公开 GitHub 页面，点击扩展图标或按 `Alt+Shift+G`。

完整步骤、更新方式和故障排查见仓库 [README](https://github.com/CC667-space/GitHelper-CN#readme) 与 [用户指南](https://github.com/CC667-space/GitHelper-CN/blob/main/docs/USER_GUIDE.md)。

## 主要能力

- 公开 GitHub 页面中文问答与本地 Session
- 点击元素和框选区域提问，必要时使用视觉 Provider
- 中文自然语言 GitHub 仓库/Issue 搜索，AI 不可用时本地降级
- 基于有限 README、配置和实现文件证据的一键仓库分析
- 多家内置 Provider，以及受限 OpenAI-compatible 自定 Provider

## Release 加固

- 清除了正式运行时中的 Phase 0 调试消息、页面触发器和 Options 开发专用区
- 保留每个 Provider 的显式“测试 Key 与模型”入口
- 增加 manifest/action 四档本地图标
- 安装 ZIP 校验根 manifest、版本、图标和禁止文件，并附 SHA-256

## 重要边界

- 这不是 Chrome Web Store 安装；需要开发者模式加载解压目录
- 仅支持公开 GitHub 页面，不支持 GitHub Token、私有仓库或 GitHub 写操作
- API Key 保存在本机浏览器扩展存储中，但浏览器本地存储不是操作系统加密保险箱
- Provider 请求可能产生费用；请使用专用、可撤销、设有额度上限的 Key
- 仓库分析是严格受限的文件采样，不等同于完整代码审计

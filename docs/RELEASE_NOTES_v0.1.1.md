# GitHelper-CN v0.1.1

这是在 v0.1.0 基础上的维护版本，集中修复“围绕当前页面”问答的上下文新鲜度，并改善 Side Panel 可读性与中文搜索的连续使用体验。未新增 Chrome 权限、Host 或 GitHub 写操作。

## 安装与更新

1. 在本 Release 的 Assets 下载 `GitHelper-CN-v0.1.1-chrome.zip`，不要下载 `Source code (zip)` 代替扩展包。
2. 可用同一 Release 的 `GitHelper-CN-v0.1.1-SHA256SUMS.txt` 校验 ZIP。
3. 首次安装：把 ZIP 解压到固定目录，再从 `chrome://extensions/` 以开发者模式“加载已解压的扩展程序”。
4. 从 v0.1.0 更新：关闭 Side Panel，清空原解压目录中的旧扩展文件，把新 ZIP 完整解压到同一路径，然后在扩展卡片点击“重新加载”。不要先移除扩展，除非接受本地会话、偏好和已保存 Key 可能被清除。

完整步骤见仓库 [README](https://github.com/CC667-space/GitHelper-CN#readme) 与 [用户指南](https://github.com/CC667-space/GitHelper-CN/blob/main/docs/USER_GUIDE.md)。

## 修复与优化

- 普通问答在每次提问时重新解析当前 DOM；同一仓库页面延迟加载 README 后，无需刷新扩展即可在下一问使用新内容。
- 仓库顶部项目简介与 README 证据明确分离；未取得 README、License 或安装说明时只会表述为“当前未读取到”，不再断言文件不存在。
- 仓库页兼容当前 GitHub 的 `main article.markdown-body` README 容器，同时保留 README 前 8,000 字符与整体上下文 32KB 的既有上限。
- Side Panel 字号可在 Options 中选择 14px、16px 或 18px；新安装默认 16px，已有偏好不会被重置，保存后已打开 Panel 立即应用。
- 中文搜索结果增加“后台打开”，便于连续查看多个结果而不离开当前搜索页。
- 每个 GitHub 标签页短期保存最近一次成功搜索结果：返回原标签页并重开 Panel 时直接恢复，不会重复调用文本 Provider 或 GitHub API。快照最多 10 项、2 小时过期，可显式清除。

## 重要边界

- 这不是 Chrome Web Store 安装；仍需开发者模式加载解压目录。
- 仅支持公开 GitHub 页面，不支持 GitHub Token、私有仓库或 GitHub 写操作。
- 普通问答只读取当前已渲染 README 的有限片段，不会另行打开完整 README、`LICENSE` 或 GitHub Contents API。
- 搜索快照位于 `chrome.storage.session`，不是长期搜索历史；浏览器会话结束、扩展重载、过期或被新搜索覆盖后不保证保留。
- Provider 请求可能产生费用；恢复已有搜索快照本身不会产生 Provider 或 GitHub API 请求。

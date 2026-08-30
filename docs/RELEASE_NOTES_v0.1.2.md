# GitHelper-CN v0.1.2

这是在 v0.1.1 基础上的安全与维护版本，集中发布仓库安全加固、依赖修复、Provider 状态新鲜度校验、操作确认后端强制、Panel 连接来源校验，以及可重复构建与 Windows CI。未新增 Chrome 权限、Host、Provider 或 GitHub 写操作。

## 安装与更新

1. 在本 Release 的 Assets 下载 `GitHelper-CN-v0.1.2-chrome.zip`，不要下载 `Source code (zip)` 代替扩展包。
2. 可用同一 Release 的 `GitHelper-CN-v0.1.2-SHA256SUMS.txt` 校验 ZIP。
3. 首次安装：把 ZIP 解压到固定目录，再从 `chrome://extensions/` 以开发者模式“加载已解压的扩展程序”。
4. 从旧版更新：关闭 Side Panel，清空原解压目录中的旧扩展文件，把新 ZIP 完整解压到同一路径，然后在扩展卡片点击“重新加载”。不要先移除扩展，除非接受本地会话、偏好和已保存 Key 可能被清除。

完整步骤见仓库 [README](https://github.com/CC667-space/GitHelper-CN#readme) 与 [用户指南](https://github.com/CC667-space/GitHelper-CN/blob/main/docs/USER_GUIDE.md)。

## 安全与可靠性改进

- Provider 能力探针结果现在同时绑定凭据的非秘密修订号、文本/视觉 Model ID 与 custom Base URL。Key、Model 或 URL 变化后不会继续误用旧的“可用”结论。
- `search` / `navigation` 的逐次确认由 Background 强制执行；未确认时不会调用 GitHub API 或打开页面。
- Panel 长连接同时校验固定名称、当前扩展 ID 和精确 Panel 页面路径，同名的其他扩展上下文不能接入会话或 Provider 协议。
- 修复 `brace-expansion`、`undici`、`postcss` 与 `nanoid` 的已知依赖公告；发布门禁要求 `pnpm audit` 为零告警。
- 测试中的虚构 Google Key 哨兵改为运行时拼接，保留脱敏测试，同时避免静态 Secret scanning 误报。

## 发布工程改进

- 发布包现在包含项目 `LICENSE` 与完整的生产依赖许可证清单 `THIRD_PARTY_NOTICES.txt`。
- ZIP 使用固定条目顺序和时间戳；相同源码与 lockfile 的重复构建会得到相同 SHA-256。
- Windows Quality workflow 覆盖 frozen install、依赖审计、许可证、类型、lint、格式、测试、build、安全扫描和打包；打包入口固定使用 PowerShell 7，避免 Windows PowerShell 5.1 对 UTF-8/LF 脚本的解析差异。
- Provider 模型候选核对日期更新为 2026-08-29；不会覆盖用户已保存的 Model ID，也不把候选值当作能力证明。

## 升级后需要注意

- 旧能力探针 Schema 不再恢复为“可用”。升级后若 Provider 显示“未验证”，已保存 Key 并未被删除；请在 Options 对相应 Provider 重新点击一次“测试 Key 与模型”。该测试可能产生少量 Provider 请求费用。
- 这不是 Chrome Web Store 安装；仍需开发者模式加载解压目录。
- 仅支持公开 GitHub 页面，不支持 GitHub Token、私有仓库或 GitHub 写操作。
- Chrome Web Store 上架继续暂停，不在本版本范围内。

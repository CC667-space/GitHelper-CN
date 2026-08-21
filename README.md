# GitHelper-CN

面向中文 GitHub 新手的本地 Chrome Side Panel AI 助手。它在公开 GitHub 页面旁提供中文问答、页面内容提问、自然语言搜索和仓库速览，帮助用户理解项目；不会替用户执行 GitHub 写操作。

> 当前版本：`0.1.0`。Chrome Web Store 上架仍暂停；GitHub Release 提供可下载 ZIP，解压后通过 Chrome 开发者模式加载。

## 快速上手：安装 GitHub Release

整个过程通常只需几分钟，不需要安装 Node.js，也不需要下载源码。

### 1. 下载扩展包

打开 [最新 GitHub Release](https://github.com/CC667-space/GitHelper-CN/releases/latest)，在 **Assets** 中下载：

- `GitHelper-CN-v0.1.0-chrome.zip`：扩展安装包
- `GitHelper-CN-v0.1.0-SHA256SUMS.txt`：可选的完整性校验值

不要下载 GitHub 自动生成的 `Source code (zip)` 代替扩展包；源码压缩包不能直接加载为扩展。

### 2. 可选：校验下载文件

在 ZIP 所在目录打开 PowerShell：

```powershell
Get-FileHash .\GitHelper-CN-v0.1.0-chrome.zip -Algorithm SHA256
```

输出的 Hash 应与 `GitHelper-CN-v0.1.0-SHA256SUMS.txt` 中的值一致。校验不一致时不要加载该文件，请重新从本仓库 Release 下载。

### 3. 解压到固定目录

把 ZIP 解压到一个不会随手删除或移动的目录，例如：

```text
C:\Tools\GitHelper-CN\
```

打开该目录后应当能直接看到 `manifest.json`、`icons`、`assets` 等内容。Chrome 加载的是这个目录，不是 ZIP 文件，也不是它的上一级目录。

### 4. 在 Chrome 中加载

1. 在地址栏打开 `chrome://extensions/`。
2. 打开右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择刚才解压、且直接包含 `manifest.json` 的目录。
5. 扩展列表出现 GitHelper-CN 且没有错误，即安装完成。

如需更容易打开，可在 Chrome 工具栏的扩展程序菜单中固定 GitHelper-CN。

### 5. 配置文本 Provider

1. 在 `chrome://extensions/` 找到 GitHelper-CN，点击“详情” → “扩展程序选项”。
2. 在“文本 Model”卡片选择 Provider。
3. 选择候选 Model，或选择“自行填写 Model ID”并输入账号实际可用的 ID。
4. 点击“保存模型配置”。
5. 在 password 输入框中填写该 Provider 的 API Key，点击“保存 Key”。保存后输入框会立即清空，只显示尾四位掩码。
6. 点击卡内“测试 Key 与模型”。显示可用后即可进行文本问答、搜索和仓库分析。

只有文本需求时不必配置视觉 Provider。DeepSeek 仅支持文本；框选内容确实需要图片理解时，再在“视觉 Model”卡片配置并测试支持视觉的 Provider。

API Key 由用户自行向 Provider 获取，可能产生 Provider 侧费用。请使用专用、可撤销且设有额度上限的 Key；不要把真实 Key 放进聊天、Issue、截图、日志、URL 或高级配置 JSON。

### 6. 开始使用

1. 打开任意公开 `https://github.com/...` 页面。
2. 点击工具栏中的 GitHelper-CN，或按 `Alt+Shift+G`。
3. 在 Side Panel 选择需要的分段：
   - “页面提问”：点击元素或框选区域后提问；
   - “仓库分析”：快速理解项目用途、功能和有限文件证据；
   - “中文搜索”：把自然语言转换为受限 GitHub 搜索；
   - “问答”：围绕当前页面继续中文对话和管理本地会话。

若默认文字仍偏小，可在扩展 Options 的“回答与操作偏好”中把 Side Panel 字号改为“紧凑（14px）/标准（16px）/大字（18px）”；新安装默认使用 16px。

如果发送按钮为灰色，请先等待顶部状态点变绿，并确认当前标签页是公开 GitHub 页面、输入框非空且没有正在执行的选择或回答。

## 更新已安装的 Release

为了尽量保留原扩展 ID 和本地配置，建议始终使用同一个解压目录：

1. 下载新 Release 的 `*-chrome.zip` 并校验。
2. 关闭当前 Side Panel。
3. 清空旧解压目录中的扩展文件，再把新 ZIP 解压到**同一路径**；不要把新文件叠加到旧的哈希资源上。
4. 打开 `chrome://extensions/`，在 GitHelper-CN 卡片点击“重新加载”。
5. 打开一个 GitHub 页面，确认设置和会话仍符合预期。

不要先点击“移除扩展程序”，除非你接受 Chrome 可能清除该扩展的本地会话、偏好和已保存 Key。更新前可在 Options 导出不含 Key 的 Model 配置 JSON；API Key 不会被导出。

## 主要功能

- 对当前公开 GitHub 页面进行中文问答，并在本地保存有限会话
- 点击页面元素或框选区域后提问；结构化信息不足时可按需使用视觉模型
- 把中文搜索描述转换为受限的 GitHub 仓库或 Issue 查询，AI 不可用时自动用本地规则降级；结果可前台或后台打开，重开原标签页的 Panel 时可恢复最近一次结果而不重复调用 API
- 读取有限的 README、配置和实现文件片段，生成“总结速览 / 详细介绍 / 原项目文件摘要”三层仓库分析
- 支持 DeepSeek、OpenRouter、OpenAI、Anthropic、Gemini、Qwen、SiliconFlow、GLM、Kimi、Grok，以及受限的 OpenAI-compatible 自定 Provider
- 支持本地 Session 新建、恢复、收展和二次确认删除

“问答”会在每次发送时重新读取当前页面的有限 DOM 内容。仓库页可读取当前已渲染 README 的
前 8,000 字符；整体上下文最多 32KB。普通问答不会另行打开完整 README 或 `LICENSE` 文件，
所以“当前未读取到”不等于文件不存在。需要读取完整仓库文件证据时，请使用“一键仓库分析”。

更完整的操作说明、Provider 配置、自定端点限制和故障排查见 [用户指南](docs/USER_GUIDE.md)。

## 安全、隐私与权限边界

- BYOK：API Key 只由用户在 Options 页录入，不写入源码、设置导出、Release 包或 Git 历史
- Key 持久化在 `chrome.storage.local`，并限制为可信扩展上下文；浏览器本地存储不是操作系统加密保险箱
- 仅支持公开 GitHub 页面；v1 不使用 GitHub Token，也不支持私有仓库
- 不执行评论、Star、Fork、Issue/PR 创建等 GitHub 写操作
- 核心 Chrome 权限只有 `sidePanel`、`storage`、`activeTab`；不申请 `tabs`、`scripting` 或 `<all_urls>`
- 页面文本始终按不可信数据处理；消息、工具参数和 Provider 出站经过 Schema 与范围校验
- 自定 Provider 只接受经校验的公网 HTTPS 端点，并仅申请该精确 Host 的运行时权限
- v1 无远程遥测；截图只在必要请求期间存在，不持久保存

OpenRouter、SiliconFlow、旧 UUAPI 与自定兼容服务可能把请求转交其上游模型供应商。本扩展无法控制第三方端点后续如何处理数据。自动测试只能证明防护机制在位，不代表任何 AI 模型绝对不受 Prompt Injection 影响。详见 [安全边界](SECURITY.md)。

## 已知限制

- 这是个人 BYOK 原型，不是 Chrome Web Store 正式上架版本
- GitHub Release ZIP 仍需开发者模式“加载已解压的扩展程序”，不是稳定版 Chrome 的一键 CRX 安装
- 不支持私有仓库、GitHub Token、云端账号同步、任意网页控制或 GitHub 写操作
- 仓库分析读取的是严格受限样本，不等同于完整代码审计
- Provider 的模型列表、权限、价格和可用性可能变化，最终以用户账号和卡内测试结果为准

## 从源码构建

要求：Node.js `>=24 <27`、pnpm `>=11 <12`、Chrome 114 或更高版本。

```powershell
git clone https://github.com/CC667-space/GitHelper-CN.git
cd GitHelper-CN
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm scan:build
pnpm package:extension
```

构建输出位于 `dist/`；版本化 ZIP 与 SHA-256 文件位于 `artifacts/`。`artifacts/` 不进入 Git，只作为 GitHub Release 上传资产。

## 项目状态

- Phase 0–12：MVP、真实体验复核和 Provider 扩展已完成
- Phase 13：公开源码与首次 GitHub Push 已完成
- Phase 14：GitHub Release 加固与发布已完成，当前版本见 [`v0.1.0`](https://github.com/CC667-space/GitHelper-CN/releases/tag/v0.1.0)
- Chrome Web Store：明确暂停，不在 Phase 14 范围内

## License

[MIT](LICENSE)

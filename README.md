# GitHelper-CN

面向中文 GitHub 新手的本地 Chrome Side Panel AI 助手。它在公开 GitHub 页面旁提供中文问答、页面内容提问、自然语言搜索和仓库速览，帮助用户更快理解项目，而不是替用户执行 GitHub 写操作。

> 当前版本：`0.1.0`。v1 MVP 已完成本地验收；目前通过 Chrome 开发者模式加载，尚未发布到 Chrome Web Store。

## 主要功能

- 对当前公开 GitHub 页面进行中文问答，并保留本地会话
- 点击页面元素或框选区域后提问；结构化信息不足时可按需使用视觉模型
- 把中文搜索描述转换为受限的 GitHub 仓库或 Issue 查询
- 读取有限的 README、配置和实现文件片段，生成面向新手的仓库速览
- 支持 DeepSeek、OpenRouter、OpenAI、Anthropic、Gemini、Qwen、SiliconFlow、GLM、Kimi、Grok，以及受限的 OpenAI-compatible 自定 Provider

## 安全与隐私边界

- BYOK：API Key 只由用户在扩展 Options 页面录入，不写入源码、配置导出或 Git 历史
- 仅支持公开 GitHub 页面；v1 不使用 GitHub Token，也不支持私有仓库
- 不执行 GitHub 写操作，不申请 `<all_urls>`、`tabs` 或 `scripting`
- 页面文本始终按不可信数据处理；工具调用、消息和 Provider 出站均经过 Schema 与范围校验
- 自定 Provider 只接受经过校验的公网 HTTPS 端点，并按精确 Host 请求可选权限

自动测试只能证明防护机制在位，不代表任何 AI 模型绝对不受 Prompt Injection 影响。完整说明见 [本地使用说明](docs/USER_GUIDE.md)。

## 本地构建与加载

要求：

- Node.js `>=24 <27`
- pnpm `>=11 <12`
- Chrome 114 或更高版本

```powershell
git clone https://github.com/CC667-space/GitHelper-CN.git
cd GitHelper-CN
pnpm install --frozen-lockfile
pnpm build
```

然后打开 `chrome://extensions/`，开启“开发者模式”，选择“加载已解压的扩展程序”，并加载项目下的 `dist` 目录。

API Key 必须在扩展的 Options 页面填写。不要把真实 Key 放进命令、聊天、Issue、截图、日志、URL 或设置 JSON。

## 开发验证

```powershell
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
pnpm scan:build
```

浏览器集成验收和打包步骤见 [本地使用说明](docs/USER_GUIDE.md)。

## 项目边界

这是个人 BYOK 原型，不包含云端账号系统、GitHub 写操作、任意网页控制、私有仓库支持或自动发布能力。Chrome Web Store 上架属于独立后续工作，不因源码公开而自动发生。

## License

[MIT](LICENSE)

# GitHelper-CN 本地使用说明

> v1 是 BYOK 个人原型，仅支持公开 GitHub 页面，不发布到 Chrome Web Store。

## 1. 安装要求

- Windows 11
- Chrome 114 或更高版本
- 需要使用 AI 对话/解释时，至少配置一个可用文本 Provider；框选内容需要视觉补充时，还需一个已验证的视觉 Provider
- v1 不需要也不接受 GitHub Token

## 2. 加载本地扩展

开发构建：

```powershell
cd C:\AI_GitHelper-CN
pnpm build
```

然后：

1. 打开 `chrome://extensions/`。
2. 开启右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择 `C:\AI_GitHelper-CN\dist`。

也可以先运行：

```powershell
pnpm package:extension
```

它会生成 `artifacts\GitHelper-CN-v0.1.0.zip`。使用前先解压，再让 Chrome 加载解压后的目录；不要把 zip 直接选作“已解压的扩展程序”。

每次重新执行 `pnpm build` 后，请在 `chrome://extensions/` 的 GitHelper-CN 卡片上点击“重新加载”。

## 3. 配置 Provider

1. 在 `chrome://extensions/` 找到 GitHelper-CN。
2. 打开“扩展程序选项”。
3. 在对应 Provider 卡片中填写 API Key 和模型。
4. 点击保存。保存成功后输入框会立即清空，页面只显示末 4 位掩码。
5. 点击“仅复测该 Provider”，或使用页面底部“运行真实能力探针”验证全部已配置 Provider。

固定端点：

- DeepSeek：`https://api.deepseek.com/chat/completions`
- UUAPI：`https://uuapi.net/v1/chat/completions`
- OpenRouter：`https://openrouter.ai/api/v1/chat/completions`

默认建议：

- 文本：DeepSeek `deepseek-v4-flash`
- 视觉：使用已通过真实探针的 OpenRouter/UUAPI 视觉模型

不要把 Key 发到聊天、Issue、日志或截图中。建议使用专用、可撤销、设有额度上限的 Key。UUAPI 与 OpenRouter 是中转/聚合端点，可能把请求转交其上游模型供应商。

## 4. 打开 Side Panel

先打开一个公开 `https://github.com/...` 页面，再用任一方式打开：

- 点击 Chrome 工具栏“扩展程序”菜单中的 GitHelper-CN；
- 快捷键 `Alt+Shift+G`；
- Chrome 更多选项中的“打开 GitHelper-CN Side Panel”。

Panel 顶部圆点：

- 绿色：Background 已连接，可以发送；
- 黄色：正在连接或已断开。扩展会自动重连；若持续黄色，先确认扩展已重新加载、当前页是 GitHub 页面。

## 5. 主要功能

### 一键仓库分析

在公开仓库页点击“一键分析”。默认展开的“README 速览”“主要功能”“文件、配置与实现”优先回答项目是什么、能做什么、怎样安装/运行、有哪些关键配置和入口。README 在最多 3 个文件的既有取样配额内优先读取；Provider 失败时仍会用本地确定性提取生成有限速览。

Star/Fork/Watch、Issue/PR、语言、平台、Release、许可证等放在默认关闭的“仓库事实”中，需要时点击展开。

数字、日期、许可证、归档状态等事实来自当前 DOM 或匿名 GitHub API，不由模型补写。匿名 API 限流时会显示降级说明。

文件检查是有限采样，不是全仓库审计：扩展最多查看 2 个高信号源码目录、3 个文件，每个文件只取前 4KB 文本；不会下载完整仓库、读取锁文件或持久保存原始文件内容。卡片显示“未获取关键文件内容”时，不应据此推断项目没有源码。

分析卡较长时，可用“收起分析/展开分析”节省 Panel 空间；收起不会清除结果。

### 普通中文对话

在底部输入框提问：

- `Enter`：发送
- `Shift+Enter`：换行

回答支持安全 Markdown/GFM 渲染，包括标题、列表、强调、代码块和表格。原始 HTML、远程图片和可点击外链不会直接执行或加载。

普通回答默认结论先行并尽量精炼；明确要求详细解释、教程或完整代码时才展开。问答区可用“收起问答/展开问答”，收起不会删除当前会话。

每个问题左侧的 `∨` 可收起该轮回复，收起后变为 `>`，不会影响其他问答。每个回复右上角的 `🗑` 只会先显示 `✓` 和 `×`：点击 `✓` 才删除该问题及回复，点击 `×` 取消。

### 点击元素提问

1. 点击“点击页面元素提问”。
2. 在 GitHub 页面点击要解释的链接、按钮或文字区域。
3. 返回 Panel，在选择预览中点击“下一步：输入问题”。
4. 输入针对该元素的问题并发送。

选择态会在页面 SPA 导航后失效，旧页面内容不会继续发送。

### 框选区域提问

1. 点击“框选页面区域提问”。
2. 在 GitHub 页面拖动框选。
3. 返回 Panel 查看结构化信息是否充分。
4. 点击“下一步：输入问题”，输入问题并发送。

结构化信息充分时只发送有限文本，不截图；不足时会提示将使用视觉 Provider 并可能产生费用。可在 Options 中关闭视觉。

### 中文 GitHub 搜索

在“中文搜索 GitHub”中输入例如：

```text
最近一年更新、Star 超过 1000 的 Python 项目
```

可以自动判断搜索仓库或 Issue，也可以手动指定。Panel 会显示转换后的 GitHub 语法、解释和有限结果卡。

## 6. 会话与本地数据

- 会话默认保留 30 天，最多保留最近 50 个。
- “当前会话”下拉框显示最近 10 个会话，可显式切换；“新建会话”会在同一页面创建独立上下文。
- 展开“管理会话”可查看同一目录；每行 `🗑` 会先显示 `✓/×`，只有 `✓` 删除整个本地 session。删除当前 session 后进入新会话；不会删除 Provider Key 或偏好。
- GitHub 页面切换、Panel 重开或 Background 重连不会清空当前活动会话；完整重开优先恢复上次活动会话。
- 页面临时上下文和截图不持久保存。

Options 提供三种相互独立的操作：

1. 清除会话/偏好：不删除 API Key；
2. 删除单个 Provider Key：不影响会话、偏好或其他 Key；
3. 清除全部本地数据：删除会话、偏好和全部 Key，必须二次确认。

## 7. 安全与范围边界

- 仅支持公开 GitHub 页面；检测到私有仓库、无权限或未找到页面时零出站。
- 只申请 `sidePanel`、`storage`、`activeTab` 和五个固定 Host；不申请 `<all_urls>`、`tabs` 或 `scripting`。
- v1 不做评论、Star、Fork、Issue/PR 创建等 GitHub 写操作。
- 页面文字全部按不可信数据处理，不能改写 System Prompt。
- 外部链接必须逐次确认；非 HTTPS、伪 GitHub Host 和 URL 内嵌凭据会被拒绝。
- 自动测试证明防护机制在位，不等于任何模型绝对不受 Prompt Injection 影响。

## 8. 常见问题

### 发送键一直是灰色

- 确认顶部圆点已经变绿；
- 确认输入框不是空白；
- 确认没有正在进行点击选择、框选或回答生成；
- 在 `chrome://extensions/` 重新加载扩展，然后重开 GitHub 页面和 Side Panel。

### 回答一次后圆点变黄

扩展会自动重连。若数秒后仍未变绿，重新打开 Side Panel；不要重复粘贴 Key。

### Provider 显示 disabled

进入 Options，查看该 Provider 的具体失败原因并使用“仅复测该 Provider”。单家失败不会阻塞其他已验证 Provider。

### DeepSeek 文本失败

确认模型不是已停用的 `deepseek-chat` / `deepseek-reasoner`，优先使用 `deepseek-v4-flash`，再仅复测 DeepSeek。

### GitHub API 限流

等待界面显示的恢复时间。扩展不会持续指数重试；搜索可降级到当前 DOM 或 GitHub 网页搜索。

## 9. MVP 批量体验复核

在同一轮真实 Chrome 体验中依次确认：

- [ ] S1：打开公开仓库，一键分析得到结构化中文卡片；默认视图先显示 README 概括、主要功能、文件配置与简单实现分析，且至少包含实际关键文件路径与内容线索。“仓库事实”默认关闭，展开后数字与 GitHub 页面/API 一致。
- [ ] S2：点击元素提问成功；再框选一个区域提问成功，结构充分时不触发视觉。
- [ ] S3：输入至少 5 组中文搜索，GitHub 语法和结果类型合理。
- [ ] S4：完成两轮对话；分别用 `∨/>` 收展第一轮并确认第二轮不受影响；切换到另一个 GitHub 页面后对话仍在且可继续发送；关闭并重开 Panel 后仍恢复。再新建一个会话并切回旧会话；分别验证问答和 session 的 `🗑 → ×` 不删除、`🗑 → ✓` 才删除。
- [ ] S5：只使用测试哨兵（不要使用真实 Key）验证敏感内容在回答上下文中显示为遮蔽标记；日志/会话中无哨兵明文。

同时复核前四轮人工补丁：分析/问答可独立收起再展开；普通回答足够精炼；包含 fenced code 的回答代码块可读且不出现白字白底；仓库分析不再以语言比例为主体；多语言 README 共存时不应挤出配置/源码，README 速览和主要功能中不应出现 banner HTML、`�` 或空内容。

S5 手工体验不要粘贴任何真实凭据。自动安全测试已经覆盖 Key/Token/私钥格式。

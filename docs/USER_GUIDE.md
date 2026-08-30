# GitHelper-CN 用户指南

> v1 是 BYOK 个人原型，仅支持公开 GitHub 页面。Chrome Web Store 上架仍暂停；GitHub Release 通过开发者模式加载解压后的 ZIP。

## 1. 安装要求

- Windows 11
- Chrome 114 或更高版本
- 需要使用 AI 对话/解释时，至少配置一个可用文本 Provider；框选内容需要视觉补充时，还需一个已验证的视觉 Provider
- v1 不需要也不接受 GitHub Token

## 2. 安装 GitHub Release

不需要 Node.js 或源码构建：

1. 打开 [最新 GitHub Release](https://github.com/CC667-space/GitHelper-CN/releases/latest)。
2. 在 Assets 下载 `GitHelper-CN-v0.1.2-chrome.zip`。不要把 GitHub 自动生成的 `Source code (zip)` 当作扩展包。
3. 可同时下载 `GitHelper-CN-v0.1.2-SHA256SUMS.txt`，并在 PowerShell 运行：

   ```powershell
   Get-FileHash .\GitHelper-CN-v0.1.2-chrome.zip -Algorithm SHA256
   ```

   输出应与校验文件一致。

4. 把 ZIP 解压到一个固定目录。目录根应直接包含 `manifest.json`；不要让 Chrome 选择 ZIP 或它的上一级目录。
5. 打开 `chrome://extensions/`，开启“开发者模式”，点击“加载已解压的扩展程序”，选择该目录。
6. 确认扩展卡片显示 GitHelper-CN 且没有错误。

### 从源码构建

开发者也可以自行构建：

```powershell
cd C:\AI_GitHelper-CN
pnpm build
```

然后：

1. 打开 `chrome://extensions/`。
2. 开启右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择 `C:\AI_GitHelper-CN\dist`。

生成与 Release 相同结构的本地安装包：

```powershell
pnpm package:extension
```

它会生成：

- `artifacts\GitHelper-CN-v0.1.2-chrome.zip`
- `artifacts\GitHelper-CN-v0.1.2-SHA256SUMS.txt`

使用前先解压，再让 Chrome 加载解压后的目录；不要把 ZIP 直接选作“已解压的扩展程序”。

每次重新执行 `pnpm build` 后，请在 `chrome://extensions/` 的 GitHelper-CN 卡片上点击“重新加载”。

### 更新 Release

下载新版本后，把新包完整解压到原来的固定路径，再在扩展卡片点击“重新加载”。不要把新包简单叠加到旧目录，否则旧的哈希资源可能残留。除非愿意丢失本地数据，否则不要先点击“移除扩展程序”。

从 `v0.1.1` 升级到 `v0.1.2` 后，旧能力探针状态会因新鲜度绑定升级而失效；这不会删除已保存 Key。若 Provider 显示“未验证”，请在对应卡片重新点击一次“测试 Key 与模型”。

## 3. 配置 Provider

1. 在 `chrome://extensions/` 找到 GitHelper-CN。
2. 打开“扩展程序选项”。
3. “Provider 与 API Key”只有“文本 Model”和“视觉 Model”两张配置卡。先在卡内选择 Provider；DeepSeek 仅支持文本，不会出现在视觉列表中。
4. 为所选 Provider 填写并保存 API Key。两张卡共用同一家 Provider 已保存的 Key；除兼容保留的静态权限路线外，首次保存时 Chrome 只请求该 Provider 的精确 API Host 权限。拒绝授权则不会保存 Key；保存成功后输入框立即清空，页面只显示末 4 位掩码。
5. 从对应角色的候选列表选择 Model，或选择“自行填写 Model ID”后输入账号实际可用的 ID，再点击“保存模型配置”。候选列表是 2026-08-29 依据官方目录核对的便捷预设，不代表账号一定有权限，也不替代真实能力探针。
6. 点击卡内“测试 Key 与模型”。该操作只测试当前所选 Provider，可能发送少量文本、流式、取消、工具、结构化输出或视觉请求并产生少量费用；正式设置页不提供批量探针。

固定端点：

- DeepSeek：`https://api.deepseek.com/chat/completions`
- OpenRouter：`https://openrouter.ai/api/v1/chat/completions`
- OpenAI：`https://api.openai.com/v1/chat/completions`
- Anthropic：`https://api.anthropic.com/v1/chat/completions`（OpenAI SDK 兼容入口）
- Google Gemini：`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`
- 阿里云百炼 Qwen：`https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`（共享旧端点，避免额外 workspace 配置）
- SiliconFlow：`https://api.siliconflow.cn/v1/chat/completions`
- GLM：`https://open.bigmodel.cn/api/paas/v4/chat/completions`
- Kimi：`https://api.moonshot.cn/v1/chat/completions`
- Grok：`https://api.x.ai/v1/chat/completions`

UUAPI 不再出现在新选择器中；旧配置、Key 与适配器仍保留兼容，不会在升级时被删除。

自定 OpenAI-compatible Provider：

1. 选择“自定 Provider（OpenAI-compatible）”。
2. 输入 HTTPS API Base URL（例如 `https://api.example.com/v1`）或完整 Chat Completions URL，填写 Model ID并先保存模型配置。
3. 配置保存后再填写 Key。Chrome 只请求该 URL 的精确 Host；localhost、私网/回环/链路本地/保留地址字面量、非 HTTPS、URL credentials/query/fragment 和非默认端口会被拒绝。
4. custom 的协议与视觉能力必须用真实能力探针验证。更换 Host 会删除旧 custom Key并释放旧 Host 权限，避免把旧凭据发送给新端点。

默认路线建议：

- 文本：DeepSeek `deepseek-v4-flash`
- 视觉：使用任何已配置并通过真实探针的视觉 Provider/model；加入目录不等于能力已验证

Options 下方的“高级 Model 配置 JSON”用于迁移 model 绑定和 custom 的非秘密 URL：

1. 点击“导出设置 JSON”，得到不含 Key/token/Authorization 的文本；custom URL 会随配置导出，因此 URL 本身不得包含秘密；
2. 可在另一安装中粘贴后点击“导入设置 JSON”；
3. Key 仍须在对应角色卡的 password 输入框中单独填写；JSON 不能增加白名单外 Provider，也不能覆盖内置 endpoint。

不要把 Key 发到聊天、Issue、日志、截图、URL 或设置 JSON 中。建议使用专用、可撤销、设有额度上限的 Key。OpenRouter、SiliconFlow、旧 UUAPI 与 custom 服务可能把请求转交其上游模型供应商。

## 4. 打开 Side Panel

先打开一个公开 `https://github.com/...` 页面，再用任一方式打开：

- 点击 Chrome 工具栏“扩展程序”菜单中的 GitHelper-CN；
- 快捷键 `Alt+Shift+G`；
- Chrome 更多选项中的“打开 GitHelper-CN Side Panel”。

在 Chrome 141 或更高版本中，切换到其他标签页会自动关闭当前 GitHelper-CN Panel。返回原标签页后不会自动重开；需要时再次点击扩展图标或使用快捷键。此行为不会新增 `tabs` 权限。

Side Panel 新安装默认使用 16px 字号。需要调整时，打开扩展 Options，在“回答与操作偏好 → Side Panel 字号”选择“紧凑（14px）”“标准（16px）”或“大字（18px）”。已打开的 Panel 会在保存后立即应用；旧版本偏好会自动补入 16px，不会重置其他设置。

Panel 顶部圆点：

- 绿色：Background 已连接，可以发送；
- 黄色：正在连接或已断开。扩展会自动重连；若持续黄色，先确认扩展已重新加载、当前页是 GitHub 页面。

## 5. 主要功能

Panel 主内容使用“页面提问 / 仓库分析 / 中文搜索 / 问答”四个分段；首次打开默认进入“页面提问”。切换分段只改变当前显示内容，不会清除分析结果、搜索结果、会话或输入草稿。

### 一键仓库分析

在公开仓库页先切到“仓库分析”，再点击“一键分析”。结果分成三块：

- “总结速览”默认显示：AI 综合 README 和已检查文件，用尽量少的自然中文说明“这是什么、对普通用户有什么用”。这里不会堆放目录、脚本或依赖清单。
- “详细介绍”默认折叠：展开后查看主要功能、安装与运行、上手难度、风险和建议。
- “原项目文件摘要”默认折叠：展开后核对实际读取的 README 文件名、识别到的章节、配置文件、目录和少量实现线索。这里不重复显示 README 段落或功能原文，也不会被 AI 改写覆盖。

README 在最多 3 个文件的既有取样配额内优先读取；其余名额优先覆盖一个配置清单和一个实现/入口文件。Provider 失败或未给出合格的新手总结时，默认区会明确显示“AI 总结暂不可用”，用户仍可展开原项目文件摘要查看本地确定性证据。

Star/Fork/Watch、Issue/PR、语言、平台、Release、许可证等放在默认关闭的“仓库事实”中，需要时点击展开。

数字、日期、许可证、归档状态等事实来自当前 DOM 或匿名 GitHub API，不由模型补写。匿名 API 限流时会显示降级说明。

文件检查是有限采样，不是全仓库审计：扩展最多查看 2 个高信号源码目录、3 个文件，每个文件只取前 4KB 文本；不会下载完整仓库、读取锁文件或持久保存原始文件内容。卡片显示“未获取关键文件内容”时，不应据此推断项目没有源码。

分析卡较长时，可用“收起分析/展开分析”节省 Panel 空间；收起不会清除结果。

### 普通中文对话

切到“问答”，在输入框提问：

- `Enter`：发送
- `Shift+Enter`：换行

回答支持安全 Markdown/GFM 渲染，包括标题、列表、强调、代码块和表格。原始 HTML、远程图片和可点击外链不会直接执行或加载。

普通回答默认结论先行并尽量精炼；明确要求详细解释、教程或完整代码时才展开。分段导航已经控制问答区显隐，因此不再提供问答整体收起按钮。

每次发送都会重新解析当前页面 DOM，因此仓库 README 延迟加载出来后，下一个问题可以直接使用新内容，
不需要刷新扩展。普通问答只读取当前已渲染 README 的前 8,000 字符，连同问题、有限历史和偏好组成的
整体上下文最多 32KB；不会另行打开完整 README、`LICENSE` 文件或调用 Contents API。
License 与安装说明只有在这段 README 或用户选区中实际出现时才可确认。仓库顶部项目简介不等于
README；界面或回答中的“当前未读取到”只表示本轮没有取得内容，不能据此判断文件不存在。

每个问题左侧的 `∨` 可收起该轮回复，收起后变为 `>`，不会影响其他问答。每个回复右上角的 `🗑` 只会先显示 `✓` 和 `×`：点击 `✓` 才删除该问题及回复，点击 `×` 取消。

### 点击元素提问

1. 切到“页面提问”，点击“点击页面元素提问”。
2. 在 GitHub 页面点击要解释的链接、按钮或文字区域。
3. 返回 Panel，在选择预览中点击“下一步：输入问题”。
4. 输入针对该元素的问题并发送。

选择态会在页面 SPA 导航后失效，旧页面内容不会继续发送。

### 框选区域提问

1. 切到“页面提问”，点击“框选页面区域提问”。
2. 在 GitHub 页面拖动框选。
3. 返回 Panel 查看结构化信息是否充分。
4. 点击“下一步：输入问题”，输入问题并发送。

结构化信息充分时只发送有限文本，不截图；不足时会提示将使用视觉 Provider 并可能产生费用。可在 Options 中关闭视觉。

### 中文 GitHub 搜索

切到“中文搜索”，输入例如：

```text
最近一年更新、Star 超过 1000 的 Python 项目
```

可以自动判断搜索仓库或 Issue，也可以手动指定。Panel 会显示转换后的 GitHub 语法、解释和有限结果卡。
搜索会优先让当前文本 Provider 理解中文描述，每次最多调用 1 次，仅发送这条搜索描述，可能产生少量费用。模型输出先经过本地 Schema 校验，再由本地代码生成 GitHub 查询；Provider 不可用或返回不合格内容时会自动使用本地规则，不会因 AI 失败而中断搜索。

每条结果提供两种打开方式：

- “打开”：在新的前台 GitHub 标签页打开；按现有规则，标签页切换会关闭原 Panel。
- “后台打开”：在后台新建标签页，当前搜索页和 Panel 保持不动，适合连续打开多个结果。

成功搜索后，扩展会在 `chrome.storage.session` 中按原 GitHub 标签页保存最近一次结果，最多保留 10 个标签页并在 2 小时后过期。回到原标签页并重新打开 Panel 时，会直接恢复搜索描述、类型和结果，不会再次调用 Provider 或 GitHub API；只有再次点击“搜索”才会产生新请求。点击“清除本次结果”会同时删除该标签页的临时快照。它不是长期搜索历史：浏览器会话结束、扩展重载、快照过期或被新搜索覆盖后均不保证保留。

## 6. 会话与本地数据

- 会话默认保留 30 天，最多保留最近 50 个。
- “当前会话”下拉框显示最近 10 个会话，可显式切换；“新建会话”会在同一页面创建独立上下文。
- 展开“管理会话”可查看同一目录；每行 `🗑` 会先显示 `✓/×`，只有 `✓` 删除整个本地 session。删除当前 session 后进入新会话；不会删除 Provider Key 或偏好。
- GitHub 页面切换、Panel 重开或 Background 重连不会清空当前活动会话；完整重开优先恢复上次活动会话。
- 页面临时上下文和截图不持久保存。

Options 提供三种相互独立的操作：

1. 清除会话/偏好：同时清除临时搜索快照，但不删除 API Key；
2. 删除单个 Provider Key：不影响会话、偏好或其他 Key；
3. 清除全部本地数据：删除会话、偏好和全部 Key，必须二次确认。

## 7. 安全与范围边界

- 仅支持公开 GitHub 页面；检测到私有仓库、无权限或未找到页面时零出站。
- 核心权限只有 `sidePanel`、`storage`、`activeTab`；GitHub 与兼容保留的原三家 Provider 为固定 Host。其他内置 Provider 只在保存 Key 时申请自身精确 Host。custom 虽在 manifest 声明 `https://*/*` 为未授予的可选候选范围，但运行时只申请用户已保存并通过校验的精确 Host。扩展不申请 `<all_urls>`、`tabs` 或 `scripting`。
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

- [ ] S1：打开公开仓库，一键分析得到结构化中文卡片；默认只显示自然、简练、面向新手的“总结速览”，不应是逐句翻译或字段清单。“详细介绍”“原项目文件摘要”“仓库事实”均默认关闭；展开详细介绍后应有功能、安装/运行、风险等经过整理的中文内容；展开原项目文件摘要后只应看到 README 取样记录与配置/实现证据，不应再次出现 README 长段落；事实区数字应与 GitHub 页面/API 一致。
- [ ] S2：四个分段均可正常切换；在“页面提问”中点击元素提问成功，再框选一个区域提问成功，结构充分时不触发视觉；两种“下一步”都会自动进入“问答”。
- [ ] S3：输入至少 5 组中文搜索，GitHub 语法和结果类型合理；确认界面明确提示可能产生少量费用，并至少验证一次 Provider 可用路径或带脱敏失败类别的本地降级路径；结果区不应显示 `origin/code/path` 等内部 Schema JSON。
- [ ] S4：完成两轮对话；分别用 `∨/>` 收展第一轮并确认第二轮不受影响；切换到另一个 GitHub 页面后对话仍在且可继续发送；关闭并重开 Panel 后仍恢复。再新建一个会话并切回旧会话；分别验证问答和 session 的 `🗑 → ×` 不删除、`🗑 → ✓` 才删除。
- [ ] S5：只使用测试哨兵（不要使用真实 Key）验证敏感内容在回答上下文中显示为遮蔽标记；日志/会话中无哨兵明文。

同时复核既有人工补丁与 UI：分析内容可收起再展开；问答没有整体收起按钮但逐轮收展正常；session 管理卡和实际会话卡之间有间隙；用户问题与 fenced code 均使用浅色背景且代码可读；普通回答足够精炼；仓库分析不再以语言比例为主体；中英文 README 共存时应优先中文说明且不挤出配置/源码；总结速览应是自然中文的新手解释而非直译/字段拼接；详细介绍应包含经过整理的用途、功能与技术线索；原项目文件摘要只保留 README 取样记录和配置/实现证据，不应出现 README 原文、错误 README、banner HTML、`�` 或空内容；中文搜索应能理解相对时间、Star 门槛和主题词，并在 AI 不可用时继续执行本地降级查询。

S5 手工体验不要粘贴任何真实凭据。自动安全测试已经覆盖 Key/Token/私钥格式。

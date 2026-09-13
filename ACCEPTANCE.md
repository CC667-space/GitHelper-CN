# ACCEPTANCE.md — 验收标准与测试方案

> 每个阶段的验收必须客观、可自动判定（除明确标注的人工体验节点）。
> Agent 完成阶段后自测通过即记 STATUS 并继续，不等人工。
> v1.1（2026-07-24）：新增 Phase 0 探针/1.5 安全地基验收；安全表述客观化（P1-2）；移除 Token/私有仓库开关项；C-2 明确核心功能阻塞最终 MVP。
> v1.2（2026-07-24）：修正凭据"明文不出现于 DOM/状态"为可实现表述（D-028）；Phase 4 可用性判定（D-031）；限流分桶用例（D-032）；Scheme 拒绝用例（D-013R）；三种数据清除用例（D-033）。
> v1.3（2026-08-03）：八家固定适配器、五个精确可选 Host 权限及无密钥设置 JSON 验收（D-063）。
> v1.4（2026-08-20）：新增 Phase 12 的 GLM/Kimi/Grok、受限 custom、UUAPI legacy 与动态精确 Host 验收（D-068）。
> v1.5（2026-08-21）：新增 Phase 14 GitHub Release 运行时清理、图标、版本化 ZIP、校验文件、README 快速上手与公开资产验收（D-070）。
> v1.6（2026-08-21）：新增普通问答实时 PageContext、README 当前 DOM、证据来源与读取边界回归（D-071）。
> v1.7（2026-08-21）：补充 D-072 字号/搜索快照回归与 `v0.1.1` 版本化 Release 复核（D-073）。
> v1.8（2026-08-29）：补充依赖审计、探针绑定、操作确认、Panel Port 来源、模型目录日期、全仓格式及确定性含许可证打包门禁（D-075）。
> v1.9（2026-08-30）：补充 `v0.1.2` 版本提交、远端 Quality、tag、Release 与两项资产 digest 核验（D-076）。
> v1.10（2026-09-13）：补充 `v0.1.3` 的 Node 24 Action 回归、完整门禁、远端 Quality/CodeQL、tag、Release 与资产 digest 核验（D-078/D-079）。

---

## 一、总验收（MVP 成功标准，对应 BASELINE 第 11 节）

| #   | 闭环             | 客观判定                                                                                            |
| --- | ---------------- | --------------------------------------------------------------------------------------------------- |
| S1  | 公开仓库一键分析 | 对 ≥3 个真实公开仓库产出完整结构化中文卡片，关键数字来自 DOM/API                                    |
| S2  | 点击/框选提问    | 选中元素/区域后得到基于该内容的中文回答；集成测试断言选中数据结构                                   |
| S3  | NL→搜索          | ≥5 组中文查询转出合理 GitHub 语法并返回结果                                                         |
| S4  | 会话保存恢复     | 保存后重开 Panel 可恢复；GitHub 页面切换不清空活动会话；可显式选择/新建会话；过期清理与容量淘汰生效 |
| S5  | 敏感信息遮蔽     | 构造含 Key/Token/私钥的内容，出站请求体被遮蔽、日志无明文                                           |

**C-2 约束**：S2（点击+框选）与 S3（NL 搜索）是冻结核心功能，**必须在 Phase 11 前完成**；缺任何一项不得进行 MVP 验收，删减须经用户确认（基线变更）。

---

## 二、测试层次

### 1. 单元测试（Vitest）

- parsers：各页面类型对 fixtures 的识别与字段提取；仓库页同时覆盖旧 `#readme` 与当前 `main article.markdown-body` 容器
- sanitizer：各类凭据正/反/边界/组合用例
- provider：mock HTTP，断言请求组装、apiHost 固定预设、model、错误映射（**八个适配器全部有 mock 测试，D-031/D-063**）
- provider-host-access：固定可选 Provider 只请求各自精确 Host；custom 只请求已保存 URL 的精确 Host；拒绝授权时 Key 零写入；Background 在 Key 读取前断言权限；删除 Key 后释放权限
- provider-settings：旧配置迁移后合并当前目录默认值；内置条目只接受 model，custom 可含非秘密 URL/model；拒绝 Key/token/Authorization、内置 endpoint 覆盖与未知字段，错误不回显输入
- custom URL/transport：拒绝 credentials/query/fragment、非默认端口、localhost、IPv4/IPv6 私网/回环/链路本地/保留地址字面量；配置/权限/请求 origin 不一致在读取 Key 与 fetch 前阻断；重定向拒绝
- provider-manager：默认路由、手动覆盖优先、Capability 护栏（vision 阻断）、探针失败 Provider 被禁用标记
- provider probe state：持久结果绑定 Key 非秘密修订号、文本/视觉 model 与 custom Base URL；Key/model/URL/import 变化后立即失效，旧 Schema 或绑定不匹配不得恢复 `available`
- credential-store：Options 上下文只 write/delete、Background 只 read/inject（读写路径唯一）；普通 storage 接口读不到凭据；**构建期 import 边界：`src/content/**` 引用 credential-store 触发 lint 报错（D-028）**
- tools registry：zod 校验通过/拒绝、白名单外拒绝、**openGitHubPage 仅接受 `https://github.com/*`、非 https Scheme（javascript/data/file/chrome/chrome-extension/blob）全部拒绝（D-013R）**
- github-api：**限流分桶（core/search/code_search）、X-RateLimit-Resource/Remaining/Reset 与 Retry-After 解析、限流后不指数重试（mock 计时断言）、到点恢复（D-032）**
- repository-analysis：固定 Schema；`overview`（AI 新手总结）、`details`（详细解释）、`sourceSummary`（本地原文件证据）分层且互不覆盖；DOM/API 事实回填；3 文件配额内最多 1 份 README，根目录中文/默认 README 优先于嵌套说明并保留非 README 文件；README banner/替换字符不进入卡片，HTML 功能表可本地提取；README 安装优先；Provider 合法部分字段经白名单投影后与本地完整结果合并，未知字段丢弃，缺少新手总结、英文自然语言或畸形 JSON 最多重试一次；技术命令/路径不因英文字符误判；Provider 失败、缺 Release/许可证/语言和 core 限流均确定性降级；网络错误不重试；canonical 仓库重定向
- storage：读写、schemaVersion、迁移、getBytesInUse 容量检查、淘汰顺序
- session-store：CRUD、同页面/同仓库关联、30 天过期、50 会话上限、摘要触发、Provider/Panel 上下文长度控制、容量淘汰顺序
- prefs-store：合法偏好持久化；旧偏好补入 16px 且不覆盖其他字段；字号只接受 14/16/18；运行时拒绝 `downloads:auto` 和非 `deny` 的 `accountChanges`
- search-snapshot-store：成功结果按 `tabId` 隔离、覆盖、最多 10 项、2 小时过期；恢复与清除不调用 Provider/GitHub API，不保存未脱敏问题或长期历史
- selection/pick：进入/退出、悬停叠层、捕获阶段点击拦截、嵌套逻辑元素归一、SelectedElement 字段、password value 不提取、SPA 失效清理
- selection/region：正向/反向 drag、结构化字段边界、统一充分性判定、needsVision 一致性、rect/viewport/scroll/dpr/zoom/sourceUrl
- capture：Phase 0 比例坐标、边界 clamp、结构充分时零调用、临时 JPEG/bitmap 释放、取消与错页拒绝
- context-builder：只含允许字段、不含整页；普通回答的简练/无废话风格契约在 System Prompt 中固定，且明确准确性优先；项目简介不得作为 README 证据，缺失只能表述为“当前未读取到”
- messaging：信封版本/请求 ID、Schema 校验、超载荷拒绝、超时
- release-hardening：正式 Background/Content/Options 不含 Phase 0 原始入口、页面调试触发器或开发专用区；Options 保留单 Provider 测试；manifest/action 引用 16/32/48/128 四档本地图标
- release engineering：生产依赖许可证清单与 `pnpm licenses --prod` 数量一致且含实际文本；ZIP 含 `LICENSE`/`THIRD_PARTY_NOTICES.txt`、固定条目顺序/时间戳，重复 build/package 的 SHA-256 一致；CI 固定 Node/pnpm 并覆盖完整质量门禁，checkout/setup-node/pnpm setup 使用声明 Node 24 运行时的官方稳定主版本

### 2. 组件测试（Vitest + Testing Library）

- Panel 消息流渲染、Provider 下拉切换（不可用 Provider 置灰）、确认弹窗（**断言无"始终允许"选项**）
- 扩展 action 单击直接调用 `sidePanel.open`；React StrictMode 重挂载时旧连接的延迟断开不会覆盖新连接状态；Panel `Enter` 发送、`Shift+Enter` 换行且 IME 合成 Enter 不误发（D-040）
- Background port 在首轮完成后断开时，Panel 自动重连并可发送第二轮；主动关闭 Panel 后不再重连（D-041）
- Panel 在 Provider 状态、会话 hydration 或请求结果返回前断开时，Background 丢弃旧 Port 的迟到消息且不得产生未处理的 disconnected-port 异常；非断开类发送错误不得被吞掉（D-064）
- 同名但不来自精确 Panel 扩展页的 Port 被断开且不启动 hydration；`navigation/search=confirm` 时未确认请求零执行，Panel 只有“取消/确认一次”，确认后仅执行一次（D-075）
- 助手 Markdown/GFM 生成语义化标题/列表/强调/代码/表格；fenced code 与行内代码样式不冲突；原始 HTML、远程图片与可点击外链不会进入 DOM（D-042/D-052）
- Options 表单读写、Key 录入与掩码（**可实现表述，D-028**）：录入用 password input；**保存成功后输入框与受控状态被清空**（断言 value === ''）；**已保存 Key 不回显明文**——保存后重新打开 Options，DOM/组件状态中只有掩码（尾 4 位），无完整 Key 字符串；Zustand store 全量序列化后不含已存 Key 明文
- Options 只用“文本 Model / 视觉 Model”两张角色卡组织配置；常用列表排除 legacy UUAPI，视觉列表另排除 DeepSeek；选择后显示 Key、2–3 个候选及手填 Model ID；custom 先保存 URL/model 后精确授权；设置 JSON 不含 Key且不能新增白名单外 Provider
- Options 偏好表单与容量用量可读；三种数据清除入口分别可用且全清有显式二次确认（D-033）、数据流向披露展示
- Panel 收到 `SESSION_STATE` 后恢复活动会话；页面变化/Background 重连的 hydrate 不覆盖当前对话；最近会话可选择且可强制新建；恢复投影过长时明确提示早期内容未展开
- Panel 以“页面提问 / 仓库分析 / 中文搜索 / 问答”四分段导航切换且不丢失当前状态；分析内容仍可收起，问答不提供整体收起按钮但保留逐轮收展（D-066）
- Panel 点击选择状态覆盖 active/selected/cancelled；已选元素随问题提交，旧页面选择被清除；选择成功后有可聚焦输入框的下一步操作
- Panel 框选状态覆盖 active/selected/cancelled；结构充分提示“不截图”，不足时在提交前提示视觉 Provider 与可能费用；框选成功后有可聚焦输入框的下一步操作
- Panel 中文搜索覆盖自动/仓库/Issue 目标、查询解释与语法、仓库/Issue 结果卡、限流提示、本地 DOM 结果与安全网页入口；混合转换每次最多调用 1 次当前文本 Provider，Provider 只输出受限意图并由本地编译，失败按脱敏类别自动使用本地规则；异常超长的可选仓库描述不得阻断整批结果，Schema 内部路径不得显示给用户；当前标签页快照可零请求恢复、清除，结果支持前台与后台打开（D-065/D-072）
- Panel 一键仓库分析覆盖运行/完成/错误、固定字段卡片、数据源、缺字段与 degradedNotice；仅“总结速览”默认显示，“详细介绍”“原项目文件摘要”和 Star/语言/Release 等“仓库事实”均默认折叠并可展开

### 3. 扩展集成测试

- Panel→BG→Content→Panel 消息往返（经来源+Schema 校验）
- 同一仓库 URL 初载无 README、随后 DOM 延迟出现 README 时，下次 `PAGE_INFO_REQUEST` 必须返回新的 `capturedAt` 与 README 内容；Provider user message 同步包含新证据，不需刷新扩展
- 非法来源消息被拒；白名单外域名 fetch 被拒
- 点击选择数据结构、框选坐标/dpr/滚动上报结构
- 点击选择集成链断言 SelectedElement 经 Content→Background→Panel 后作为不可信数据进入 AI 请求，且 SPA 后旧 `sourceUrl` 不出站
- 框选集成链断言充分结构只走文本；不足结构由 Background 裁剪后才携图走视觉；`visionEnabled=false` 时截图/Provider/会话写入均为零
- 搜索集成链断言 Panel→Background→只读工具→匿名 API→Panel；打开结果只接受 `https://github.com/*`
- 仓库分析链断言当前 PageContext→core/Provider→固定卡片；私有页面 core/Provider 均零调用；Provider 不能覆盖 API 数字事实
- 仓库分析读取固定 Contents API 的受限文件样本：最多 2 个源码目录、3 个文件、每文件 4KB 文本；锁文件/路径穿越拒绝，根目录中英文 README 共存时选择中文说明；三个文件名额优先覆盖 1 份 README、1 份配置清单与 1 份实现/入口文件；`sourceSummary` 只记录 README 路径/章节和配置/实现证据，不返回 README 段落或功能原文
- 单轮问答收展互不影响；问答删除与 session 删除均须垃圾桶后 `✓/×` 二次确认，`×` 零变更，`✓` 不误删相邻轮次或非目标 session

### 4. E2E（Playwright，加载扩展，Phase 11）

- 打开真实/快照 GitHub 页 → 开 Panel → 一键分析出卡片；默认仅显示新手总结，详细介绍、原项目文件摘要和仓库事实均关闭；展开原项目文件摘要后，中英文 README 共存且含 banner HTML/功能表时应记录实际选择的中文 README 与章节，不显示 README 原文，并包含配置与实际实现文件证据；展开事实区后数字可见
- SPA 导航后上下文刷新且无重复初始化
- 仓库快照先移除 README、再以 `article.markdown-body` 延迟插入；下一次 PageContext 包含边界内的安装与 License 文字，简介不被当成 README
- 四分段可切换且点击/框选下一步自动进入问答；会话恢复、切换 GitHub 页面后活动会话仍保留，Panel 重载后继续恢复；逐轮收展及两类确认删除可操作
- Release 构建在初始页面和 SPA 导航后都不创建 `#git-helper-phase0-run-button`，且既有 Panel/分析/搜索/会话闭环不回归

### 5. 专项安全测试（Phase 1.5 地基 + Phase 10 加固）

**客观机制项（自动测试可判定，P1-2）**：

- 网页内容未进入 System Prompt（组装单测）
- 页面内容带"不可信数据"标注
- 白名单外工具调用被拒绝
- 工具参数经 zod Schema 校验
- 高风险工具（写操作/账号类）不可用
- 敏感字段被遮蔽（S5 系列用例）
- 非法输出被拒绝
- 用户数据未发送到未授权端点（出站域名白名单断言）
- content script 上下文读取凭据存储失败（setAccessLevel 生效）
- `src/content/**` 导入 credential-store 被 lint 拒绝（import 边界，D-028）
- 消息载荷/日志/UI 持久状态无已保存 Key 明文（唯一合法明文窗口 = 录入时 password input，保存后清空）
- 导航/打开类工具拒绝非 https Scheme（javascript/data/file/chrome 等）
- 私有仓库/无权限页面零出站
- 构建产物无 eval/new Function/远程脚本引用

**评估项（红队测试，不宣称绝对免疫）**：

- ≥10 个 Prompt Injection 攻击样例（藏于 README/Issue/代码注释的指令覆盖、Key 诱导、越权工具诱导等），逐一记录模型实际行为与防护层拦截情况于 `tests/security/redteam-log.md`
- **验收标准是"记录完整、机制层全部拦截"，而非"模型绝对不受影响"**

### 6. 韧性测试

- API 错误（401/429/500）→ 可读中文提示 + 建议切换 Provider
- 网络中断 → 退避重试 → 失败可重试；请求可 Abort、有超时
- 长对话 → 摘要触发、上下文不超限
- GitHub 匿名 API 限流（D-032）→ 按 resource 分桶节流；限流后**不指数重试**，等 Reset/Retry-After 恢复；search 受限降级网页搜索/本地 DOM，core 受限降级纯 DOM
- Service Worker 回收 → 唤醒后会话不丢
- 存储逼近软/硬上限 → 提示与淘汰按序执行
- 单个 Provider 真实探针失败（D-031）→ 记录 + UI 禁用 + 不阻塞；仅全路线失败才暂停

---

## 三、每阶段验收速查

| Phase | 关键验收（全部自动，除标注）                                                                                                                                                                                                                                                                                                                                                                                           |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | build 成功（manifest 含 minimum_chrome_version "114"）、扩展加载无错、探针 A（基础）/B（截图坐标换算实测定稿并回写 ARCH）/C（权限复审）/D（setAccessLevel）全部有结论、Git 基线提交存在、权限清单定稿                                                                                                                                                                                                                  |
| 1     | 类型编译通过、storage/messaging/logger 单测通过、权限与 ARCH 一致、无规划文件副本                                                                                                                                                                                                                                                                                                                                      |
| 1.5   | 安全地基用例全过：凭据隔离、Host 白名单 fetch、消息来源+Schema 校验、日志脱敏、私有阻断骨架、CSP 扫描、Abort/超时/载荷限制                                                                                                                                                                                                                                                                                             |
| 2     | Panel 打开、三端消息往返集成测试通过、非法消息被拒                                                                                                                                                                                                                                                                                                                                                                     |
| 3     | fixtures 页面识别/解析正确、SPA 去抖刷新且不重复初始化、私有页面阻断、失败不抛异常                                                                                                                                                                                                                                                                                                                                     |
| 4     | 八适配器 mock 测试全过、五个新增精确可选 Host 权限与无密钥 JSON 边界通过、能力探针报告产出、手动切换生效、Capability 护栏生效、凭据隔离通过、录入后输入框清空+无明文回显；action 可直接打开 Panel、连接状态稳定且断线可恢复、Enter/Shift+Enter 语义通过；真实端点：≥1 文本 + ≥1 视觉 Provider 可用即达标（单家失败记录+禁用不阻塞，全路线失败才暂停，D-031/D-063）｜ **人工：真实 Key 填入 + 真实端点探针 + 手测对话** |
| 5     | 会话恢复、过期+容量淘汰、偏好读写（operationPolicy 收紧类型）、三种清除各自"目标无残留、非目标完好"（D-033）                                                                                                                                                                                                                                                                                                           |
| 6     | pick 进出、选中结构正确、基于元素回答                                                                                                                                                                                                                                                                                                                                                                                  |
| 7     | 框选结构提取、充分不截图/不足时 SW 截图裁剪对齐、visionEnabled 开关、截图不持久保存                                                                                                                                                                                                                                                                                                                                    |
| 8     | ≥5 组查询转换正确、仓库/Issue 搜索返回并渲染；core/search/code_search 独立持久化，search 限流零重试且到点恢复，网页/本地 DOM 降级可读                                                                                                                                                                                                                                                                                  |
| 9     | ≥3 个真实公开仓库完整卡片、数字来自 DOM/API 事实、显示受限关键文件证据、Provider structuredOutput 降级、缺字段与匿名 core 限额降级提示正常                                                                                                                                                                                                                                                                             |
| 10    | 安全客观项全过（含 Scheme 拒绝、import 边界、三种清除）+ 红队记录 ≥10 样例                                                                                                                                                                                                                                                                                                                                             |
| 11    | 全测试绿、打包可加载、S1-S5 证据齐全（前置：Phase 6/7/8 已完成）｜ **人工：S1-S5 批量体验复核**                                                                                                                                                                                                                                                                                                                        |
| 12    | GLM/Kimi/Grok/custom Mock、安全、动态 Host、迁移、UUAPI legacy、构建与 E2E 全过；无新 Key 不阻塞                                                                                                                                                                                                                                                                                                                       |
| 13    | MIT 公开源码、历史邮箱隐私处理、全历史凭据审计、公开仓库与首次 Push 通过                                                                                                                                                                                                                                                                                                                                               |
| 14    | 正式运行时无开发探针入口；图标完整；README 快速上手完整；typecheck/lint/format/`git diff --check`/test/build/安全扫描/E2E/确定性打包/凭据审计全过；获授权的 `v0.1.0`/`v0.1.1`/`v0.1.2`/`v0.1.3` Release 均只含可核对的 ZIP/SHA256 资产；`v0.1.3` 版本提交的远端 Quality/CodeQL 成功，且 Quality 不再产生三个 Action 的 Node.js 20 弃用警告                                                                             |

---

## 四、人工体验节点（仅 2 个）

1. Phase 4：真实 Provider Key 填入后跑真实端点能力探针 + 手测一次对话（验证真实厂商连通）。
2. Phase 11：S1–S5 五条闭环批量体验复核（验证真实交互观感）。

其余全部由自动测试 + 构建证据判定。

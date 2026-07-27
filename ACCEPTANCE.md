# ACCEPTANCE.md — 验收标准与测试方案

> 每个阶段的验收必须客观、可自动判定（除明确标注的人工体验节点）。
> Agent 完成阶段后自测通过即记 STATUS 并继续，不等人工。
> v1.1（2026-07-24）：新增 Phase 0 探针/1.5 安全地基验收；安全表述客观化（P1-2）；移除 Token/私有仓库开关项；C-2 明确核心功能阻塞最终 MVP。
> v1.2（2026-07-24）：修正凭据"明文不出现于 DOM/状态"为可实现表述（D-028）；Phase 4 可用性判定（D-031）；限流分桶用例（D-032）；Scheme 拒绝用例（D-013R）；三种数据清除用例（D-033）。

---

## 一、总验收（MVP 成功标准，对应 BASELINE 第 11 节）

| # | 闭环 | 客观判定 |
|---|---|---|
| S1 | 公开仓库一键分析 | 对 ≥3 个真实公开仓库产出完整结构化中文卡片，关键数字来自 DOM/API |
| S2 | 点击/框选提问 | 选中元素/区域后得到基于该内容的中文回答；集成测试断言选中数据结构 |
| S3 | NL→搜索 | ≥5 组中文查询转出合理 GitHub 语法并返回结果 |
| S4 | 会话保存恢复 | 保存后重开 Panel 可恢复；GitHub 页面切换不清空活动会话；可显式选择/新建会话；过期清理与容量淘汰生效 |
| S5 | 敏感信息遮蔽 | 构造含 Key/Token/私钥的内容，出站请求体被遮蔽、日志无明文 |

**C-2 约束**：S2（点击+框选）与 S3（NL 搜索）是冻结核心功能，**必须在 Phase 11 前完成**；缺任何一项不得进行 MVP 验收，删减须经用户确认（基线变更）。

---

## 二、测试层次

### 1. 单元测试（Vitest）
- parsers：各页面类型对 fixtures 的识别与字段提取
- sanitizer：各类凭据正/反/边界/组合用例
- provider：mock HTTP，断言请求组装、apiHost 固定预设、model、错误映射（**三个适配器全部有 mock 测试，D-031**）
- provider-manager：默认路由、手动覆盖优先、Capability 护栏（vision 阻断）、探针失败 Provider 被禁用标记
- credential-store：Options 上下文只 write/delete、Background 只 read/inject（读写路径唯一）；普通 storage 接口读不到凭据；**构建期 import 边界：`src/content/**` 引用 credential-store 触发 lint 报错（D-028）**
- tools registry：zod 校验通过/拒绝、白名单外拒绝、**openGitHubPage 仅接受 `https://github.com/*`、非 https Scheme（javascript/data/file/chrome/chrome-extension/blob）全部拒绝（D-013R）**
- github-api：**限流分桶（core/search/code_search）、X-RateLimit-Resource/Remaining/Reset 与 Retry-After 解析、限流后不指数重试（mock 计时断言）、到点恢复（D-032）**
- repository-analysis：固定 Schema；DOM/API 事实回填；README 安装优先；缺 Release/许可证/语言降级；core 限流零重试；Provider structuredOutput 与 Prompt+zod 单次重试；网络错误不重试；canonical 仓库重定向
- storage：读写、schemaVersion、迁移、getBytesInUse 容量检查、淘汰顺序
- session-store：CRUD、同页面/同仓库关联、30 天过期、50 会话上限、摘要触发、Provider/Panel 上下文长度控制、容量淘汰顺序
- prefs-store：合法偏好持久化；运行时拒绝 `downloads:auto` 和非 `deny` 的 `accountChanges`
- selection/pick：进入/退出、悬停叠层、捕获阶段点击拦截、嵌套逻辑元素归一、SelectedElement 字段、password value 不提取、SPA 失效清理
- selection/region：正向/反向 drag、结构化字段边界、统一充分性判定、needsVision 一致性、rect/viewport/scroll/dpr/zoom/sourceUrl
- capture：Phase 0 比例坐标、边界 clamp、结构充分时零调用、临时 JPEG/bitmap 释放、取消与错页拒绝
- context-builder：只含允许字段、不含整页；普通回答的简练/无废话风格契约在 System Prompt 中固定，且明确准确性优先
- messaging：信封版本/请求 ID、Schema 校验、超载荷拒绝、超时

### 2. 组件测试（Vitest + Testing Library）
- Panel 消息流渲染、Provider 下拉切换（不可用 Provider 置灰）、确认弹窗（**断言无"始终允许"选项**）
- 扩展 action 单击直接调用 `sidePanel.open`；React StrictMode 重挂载时旧连接的延迟断开不会覆盖新连接状态；Panel `Enter` 发送、`Shift+Enter` 换行且 IME 合成 Enter 不误发（D-040）
- Background port 在首轮完成后断开时，Panel 自动重连并可发送第二轮；主动关闭 Panel 后不再重连（D-041）
- 助手 Markdown/GFM 生成语义化标题/列表/强调/代码/表格；fenced code 与行内代码样式不冲突；原始 HTML、远程图片与可点击外链不会进入 DOM（D-042/D-052）
- Options 表单读写、Key 录入与掩码（**可实现表述，D-028**）：录入用 password input；**保存成功后输入框与受控状态被清空**（断言 value === ''）；**已保存 Key 不回显明文**——保存后重新打开 Options，DOM/组件状态中只有掩码（尾 4 位），无完整 Key 字符串；Zustand store 全量序列化后不含已存 Key 明文
- Options 偏好表单与容量用量可读；三种数据清除入口分别可用且全清有显式二次确认（D-033）、数据流向披露展示
- Panel 收到 `SESSION_STATE` 后恢复活动会话；页面变化/Background 重连的 hydrate 不覆盖当前对话；最近会话可选择且可强制新建；恢复投影过长时明确提示早期内容未展开
- 分析区与问答区可独立收起/展开；收起不丢失当前状态
- Panel 点击选择状态覆盖 active/selected/cancelled；已选元素随问题提交，旧页面选择被清除；选择成功后有可聚焦输入框的下一步操作
- Panel 框选状态覆盖 active/selected/cancelled；结构充分提示“不截图”，不足时在提交前提示视觉 Provider 与可能费用；框选成功后有可聚焦输入框的下一步操作
- Panel 中文搜索覆盖自动/仓库/Issue 目标、查询解释与语法、仓库/Issue 结果卡、限流提示、本地 DOM 结果与安全网页入口；搜索链不调用 AI Provider
- Panel 一键仓库分析覆盖运行/完成/错误、固定字段卡片、数据源、缺字段与 degradedNotice；数字事实以卡片字段直接呈现

### 3. 扩展集成测试
- Panel→BG→Content→Panel 消息往返（经来源+Schema 校验）
- 非法来源消息被拒；白名单外域名 fetch 被拒
- 点击选择数据结构、框选坐标/dpr/滚动上报结构
- 点击选择集成链断言 SelectedElement 经 Content→Background→Panel 后作为不可信数据进入 AI 请求，且 SPA 后旧 `sourceUrl` 不出站
- 框选集成链断言充分结构只走文本；不足结构由 Background 裁剪后才携图走视觉；`visionEnabled=false` 时截图/Provider/会话写入均为零
- 搜索集成链断言 Panel→Background→只读工具→匿名 API→Panel；打开结果只接受 `https://github.com/*`
- 仓库分析链断言当前 PageContext→core/Provider→固定卡片；私有页面 core/Provider 均零调用；Provider 不能覆盖 API 数字事实
- 仓库分析读取固定 Contents API 的受限文件样本：最多 2 个源码目录、3 个文件、每文件 4KB 文本；锁文件/路径穿越拒绝，卡片显示实际文件证据且不返回原文
- 单轮问答收展互不影响；问答删除与 session 删除均须垃圾桶后 `✓/×` 二次确认，`×` 零变更，`✓` 不误删相邻轮次或非目标 session

### 4. E2E（Playwright，加载扩展，Phase 11）
- 打开真实/快照 GitHub 页 → 开 Panel → 一键分析出卡片，并显示受限读取的实际关键文件证据
- SPA 导航后上下文刷新且无重复初始化
- 会话恢复；切换 GitHub 页面后活动会话仍保留，Panel 重载后继续恢复；逐轮收展及两类确认删除可操作

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

| Phase | 关键验收（全部自动，除标注） |
|---|---|
| 0 | build 成功（manifest 含 minimum_chrome_version "114"）、扩展加载无错、探针 A（基础）/B（截图坐标换算实测定稿并回写 ARCH）/C（权限复审）/D（setAccessLevel）全部有结论、Git 基线提交存在、权限清单定稿 |
| 1 | 类型编译通过、storage/messaging/logger 单测通过、权限与 ARCH 一致、无规划文件副本 |
| 1.5 | 安全地基用例全过：凭据隔离、Host 白名单 fetch、消息来源+Schema 校验、日志脱敏、私有阻断骨架、CSP 扫描、Abort/超时/载荷限制 |
| 2 | Panel 打开、三端消息往返集成测试通过、非法消息被拒 |
| 3 | fixtures 页面识别/解析正确、SPA 去抖刷新且不重复初始化、私有页面阻断、失败不抛异常 |
| 4 | 三适配器 mock 测试全过、能力探针报告产出、手动切换生效、Capability 护栏生效、凭据隔离通过、录入后输入框清空+无明文回显；action 可直接打开 Panel、连接状态稳定且断线可恢复、Enter/Shift+Enter 语义通过；真实端点：≥1 文本 + ≥1 视觉 Provider 可用即达标（单家失败记录+禁用不阻塞，全路线失败才暂停，D-031）｜ **人工：真实 Key 填入 + 真实端点探针 + 手测对话** |
| 5 | 会话恢复、过期+容量淘汰、偏好读写（operationPolicy 收紧类型）、三种清除各自"目标无残留、非目标完好"（D-033） |
| 6 | pick 进出、选中结构正确、基于元素回答 |
| 7 | 框选结构提取、充分不截图/不足时 SW 截图裁剪对齐、visionEnabled 开关、截图不持久保存 |
| 8 | ≥5 组查询转换正确、仓库/Issue 搜索返回并渲染；core/search/code_search 独立持久化，search 限流零重试且到点恢复，网页/本地 DOM 降级可读 |
| 9 | ≥3 个真实公开仓库完整卡片、数字来自 DOM/API 事实、显示受限关键文件证据、Provider structuredOutput 降级、缺字段与匿名 core 限额降级提示正常 |
| 10 | 安全客观项全过（含 Scheme 拒绝、import 边界、三种清除）+ 红队记录 ≥10 样例 |
| 11 | 全测试绿、打包可加载、S1-S5 证据齐全（前置：Phase 6/7/8 已完成）｜ **人工：S1-S5 批量体验复核** |

---

## 四、人工体验节点（仅 2 个）
1. Phase 4：真实 Provider Key 填入后跑真实端点能力探针 + 手测一次对话（验证真实厂商连通）。
2. Phase 11：S1–S5 五条闭环批量体验复核（验证真实交互观感）。

其余全部由自动测试 + 构建证据判定。

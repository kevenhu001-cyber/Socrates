# 原生 Android 功能对齐清单

功能以 Socrates 项目本身的实际行为为准；视觉以用户参考图为几何基准，并与现有前端设计语言对齐。当前为原生 Kotlin / Jetpack Compose 客户端 1.4 开发版；**尚未达到完整功能对齐**。没有向产品写入截图中的对话、示例课程、账号资源或演示业务数据。测试数据只存在于测试源码中。

对照仓库 HEAD：`6ae3470555ed34f3854cba8e95d19dae1308db03`。此次获准修改 Web/后端，接入一次性浏览器→原生安全登录交接；Expo 和共享 TypeScript 包未改动。原有未提交修改保留；没有提交或推送。

## 最新：Chrome 登录与前端体验核对

- 所有现有登录门禁改用自定义 Chrome 交接页，不再显示原生邮箱、密码、验证码、注册或重置表单。点击后只向 `com.android.chrome` 发出 `ACTION_VIEW`，固定打开 `https://app.topodrive.top`；未安装/禁用 Chrome 和系统禁止启动都有明确错误与重试，不偷偷换浏览器。不向浏览器传递 API 地址、令牌、Cookie 或草稿。
- **现已实现代码层登录闭环，尚未生产/设备验收。** 原生生成随机 state 和 PKCE verifier；Chrome URL 只携带 state 与 S256 challenge。网页完成登录后显示真实账号并明确确认，再由后端签发五分钟一次性代码，通过固定 HTTPS App Links 返回。原生校验来源、状态与十分钟 pending 有效期，先消费加密 pending，再用 verifier 换取独立 bearer/refresh 凭据，更新登录态并清空旧账号聊天数据。浏览器 sid 始终不离开浏览器。
- 新增 `mobile/browser/authorize` 与 `mobile/browser/exchange`，不复用原来的反向 `mobile/web-session`，也不接入 GitHub mobile OAuth 的自定义 scheme。代码仅存散列、在数据库事务中原子消费；失败/重放不会产生凭据。自定义 API 连接被明确拒绝，不会被生产凭据覆盖。发布必须配置真实 release/Play 签名 SHA-256 和 nginx 域名关联路由，见 [部署说明](docs/browser-login-deployment.md)。
- 自定义按钮、文本按钮、图标按钮、字段补齐键盘可见焦点与禁用反馈，图标保留 44 dp 最小触控区；装饰性手绘图标移出无障碍树。浅色中性色、边框与正文排版按 `frontend/src/styles/themes.css`、`tokens.css` 核对，没有引入默认业务控件。
- 定时任务补齐 `hourly` 创建/编辑；列表/详情显示本地化频率、失败状态、服务端最近运行与执行次数。详情增加暂停/恢复，完成或失败任务恢复发送 `active`，与 `ScheduledTaskRow.tsx` 一致；列表重载同步当前详情，避免继续使用旧状态操作。
- `custom` 虽被任务路由接受，`server/src/services/core/scheduler.ts::computeNextRunAt` 实际仍将其视为单次，本轮不开放会误导用户的 cron 重复表单。完整执行历史、复杂策略和通知仍有缺口。
- 本轮已通过 Android Debug 构建、70 项 JVM 测试、Lint 及 AndroidTest 源码编译；服务端隔离 PostgreSQL 的 38 项聚焦测试全部通过、无跳过，包含真实 HTTP 交接、安全失败和并发消费。Web lint/build 及 4 项聚焦 Playwright 回归通过。**没有启动设备/模拟器、没有执行 AndroidTest、没有线上部署或真实账号联调**。以下历史记录如有冲突，以本节及验证边界为准。

## 1.4 自定义界面与新增链路

- 用 Foundation、BasicTextField、Canvas 与自有布局重新实现按钮、图标按钮、表单、标签、卡片、菜单、弹层、提示、开关、单选、进度和抽屉。业务控件采用自有颜色参数，不再借用 Material 的 ButtonDefaults/CardDefaults；文字排版、主题和既有状态基础设施仍由 Compose 提供。
- 以约 390 dp 的视口归一化参考图：68 dp 顶栏、44 dp 主触控、34/12 dp 收起/展开输入边距、80% 宽侧栏、206 dp 顶边对齐的会话菜单；线性主图标由应用绘制。参考图、示例对话和业务资源不打包入产品。
- 真实会话置顶、归档/恢复、侧栏归档筛选；聊天菜单可移入/移出已有项目、查看本会话实际附件并重新引用。操作保留原始 wire，使用当前配置的服务器和认证回调。
- 推理强度白名单 none/low/medium/high 写入下一次请求的 reasoning_effort；实际模型支持仍由后端决定。回复朗读使用设备 TTS，不冒充双向实时语音。
- 图像页接入真实 prompt 创建端点和鉴权图片；资料库改为两列错落卡片、顶部文件名和底部格式图标；图像只按真实 MIME 筛选。插件采用松散目录行与启停/详情菜单，不编造商店列表或新增连接器能力。
- 补齐全部 15 种文字样式、自有形状与语义色；录音时保留同一编辑器及输入连接；反馈只有接口确认成功后改变选中状态；会话标记按最新 wire 合并，项目读取用代次阻止旧响应覆盖。
- 系统状态栏、导航栏、输入法和系统选择器保留平台实现；不绘制假键盘或把供应商系统 UI 的差异算成应用像素一致性。

## 上一轮源码收尾（历史记录）

- 功能页不再使用 Surface、Material 默认图标或默认按钮/卡片配色工厂。文件、网页、刷新及账号操作等加入统一的 24 单位手绘图标族；资料库保留真实文件的双列卡片，插件保留真实账号目录行。
- 项目、记忆、助手和任务改用惰性列表；任务与记忆采用自定义开关，已完成任务不再出现暂停开关。搜索无结果时仍保留记忆分页入口，不拿当前页匹配结果冒充全量结果。
- 详情操作改为纵向自适应按钮，避免手机窄屏横排挤压；补齐记忆正文与状态，详情文本可选择复制。内置插件不显示编辑/删除入口。
- 保存、生成和删除期间统一禁用可冲突操作与表单；返回键、顶栏返回和系统关闭请求使用同一层级逻辑。图像生成成功后离开输入表单；列表重试不再误用于表单保存或打断进行中的操作。
- 定时任务保存校验执行内容、频率及带时区的未来时间。图像详情与缩略图均接受已支持的旧版/v2 文件路径，仅凭资源 ID 进行鉴权下载，不请求任意远端地址。
- 此轮只做代码分析和修改，没有编译、执行测试、操作设备或截图。此前的测试结果与 APK 不覆盖这里的改动；不声称像素级一致性或生产功能已验收。

## 已有真实流程

- 消息编辑并重发、重新生成、从指定消息创建分支、会话内搜索跳转及有用/无用/清除反馈。编辑使用真实消息端点和会话作用域，先持久化截断再重新生成。
- 分享链接读取、创建、复制及撤销，区别于原有的本地分享文本。
- 模型服务商加载、创建、编辑、激活及删除；可设置多模态能力；密钥留空时不覆盖已有密钥。聊天由后端实际激活的服务商选路，不做仅本地切换的假模型选择。
- 记忆列表、禁用项筛选、游标分页、创建、编辑、启停与确认删除。
- 项目系统提示、项目内会话浏览与会话移入/移出。移动前获取完整会话，避免拿列表摘要覆盖消息。
- 资料库文件全量游标加载；聊天附件保存规范的 `id/kind/name/mime/size/fileId`，跨端已有图片必要时按真实文件 ID 读取后压缩，受接口上限约束。
- 真实工具调用/结果/执行进度/错误合并及持久化；原生展示工具输入、结果、来源链接和附件元信息，不再只有一行活动标题。
- 测验设置、按题调用实际模型生成、通用题干与公式展示、作答、评分、解析、历史重开及答案保存。评分复用项目基线的规则：选择题对字母、填空题对接受答案、简答题按关键词启发式评分；不是模型精确阅卷。
- 导师诊断按实际选项的 `level` 处理，不伪造成有标准答案的考试。生成诊断、填写、自我评估、初始知识状态/计划及导师对话已有实际链路，但教学计划与知识建模仍是简化版本。
- 定时任务补齐真实立即运行接口。资源创建/编辑/启停/删除继续走账号后端，没有新建独立调度器。

## 逐项核对

“已有实现”只表示代码和对应接口接通；没有生产账号/设备验证的项目仍不能视为最终验收通过。

| 能力 | 对照项目位置 | Android 状态 | 剩余差距或验证要求 |
| --- | --- | --- | --- |
| 登录、注册、密码恢复、账号资料与安全 | `server/src/routes/auth.ts`、`ui/BrowserLogin.kt`、`ui/UtilityScreens.kt` | Chrome 完成网页登录、账号确认、一次性 PKCE 代码与固定 HTTPS App Links 回调、原生独立凭据交换已接通 | 仍需部署真实签名指纹/域名关联，完成生产账号和设备闭环验收；不是复制浏览器 Cookie |
| 流式聊天、推理内容、停止与错误 | `packages/chat/src/turn.ts`、`server/src/routes/chat/` | 已有实现并补齐 SSE 简写与流内错误处理 | 未验证真实模型、网络中断恢复与后台存活 |
| 聊天历史、重命名、删除 | `server/src/routes/sessions.ts` | 已有实现 | 置顶和归档/恢复已接通；标签、批量管理、导入/导出尚非完整对齐 |
| 编辑、重生成、分支、反馈 | `apps/socrates/src/useMessageActions.ts`、`packages/chat/src/branch.ts`、`server/src/routes/messages.ts` | 本轮接通 | 未实机操作；没有完整的可视化分支树 |
| 会话内搜索 | Web 聊天搜索及会话消息 | 本轮接通关键词与跳转 | 全局跨会话内容搜索及多条件筛选未对齐 |
| 分享 | `apps/socrates/src/useSessionSharing.ts`、`server/src/routes/sessions.ts` | 本地文本与真实分享链接均有入口 | 分享权限和公开访问实际部署未验证；不是原生公开分享阅读器 |
| 多模态与文档附件 | `packages/core/src/index.ts`、`server/src/routes/files.ts` | 实际上传、文本提取、历史字段保留与图片压缩 | 多附件编辑、全部文件类型原生预览、长文档工作区尚有差距；文件读取大小有限制 |
| Markdown、代码、表格、LaTeX | `frontend/src/render/`、`packages/ui/src/` | 保留通用原生渲染 | 数学与复杂排版视觉一致性未实机验证；不代表 Web 全部富渲染器已经移植 |
| 工具与来源 | `packages/chat/src/turn.ts`、`frontend/src/render/toolOutput.ts` | 合并、存储、通用结果/链接展示 | Web 专用卡片、内联可视化和交互式结果尚未全部实现 |
| 模型及自定义服务商 | `apps/socrates/src/useCatalogManagement.ts`、`server/src/routes/apiKeys.ts` | 本轮真实 CRUD/激活 | 未用真实服务商调用验证；不调用仅管理员可用的 `/system-models` 冒充普通用户目录 |
| 项目 | `apps/socrates/src/useProjectLibrary.ts`、`server/src/routes/projects.ts` | CRUD、系统提示、绑定新聊天及移入/移出已有会话 | 后端无独立“项目—文件”关联/解除接口；不以永久删除文件模拟解除关联；其他项目工作区体验仍有差距 |
| 助手 | `apps/socrates/src/useCatalogManagement.ts`、`server/src/routes/creations.ts` | 账号真实目录、指令 CRUD、绑定并聊天 | 完整配置字段、起始提示与编辑体验仍需逐项验证 |
| 资料库 | `frontend/src/react/pages/workspace/`、`server/src/routes/files.ts` | 真实目录、分页、改名、删除与附加到聊天 | 本地搜索与真实 MIME 图像筛选已接通；专用 PDF/文档预览、批量选择与完整工作区交互未对齐 |
| 记忆 | `server/src/routes/memory.ts` | 本轮真实 CRUD、启停、禁用筛选与分页 | 模型记忆调用的生产行为、所有用户偏好未验证 |
| 测验 | `apps/socrates/src/useLearningSetup.ts`、`packages/ui/src/examModel.ts` | 实际生成、作答、规则评分、解析及服务器 `examData` | 生成解析容错、所有语言提示、取消恢复与 Web 细节尚非逐项一致；无真实模型验证 |
| 导师诊断与学习 | `packages/ui/src/tutor.ts`、`apps/socrates/src/useLearningSetup.ts` | 部分实现 | 当前仍为主题级知识节点与简化计划；五方面知识建模、完整自适应进度、节点掌握、错题重做、知识快照与 quiz/practice 分支未完整移植 |
| 定时任务 | `frontend/src/react/pages/scheduled/`、`server/src/routes/scheduledTasks.ts` | CRUD、实际运行时间/频率、启停与立即运行 | 执行历史、复杂运行策略、通知配置和全部任务类型未完整对齐；后台服务未生产验证 |
| 插件 | `frontend/src/react/pages/workspace/PluginsView.tsx`、`server/src/routes/plugins.ts` | 真实列表、详情、启停和删除；不显示伪安装入口 | 市场安装、外部账号 OAuth/连接器登录与全部详情体验未完整对齐 |
| 图像 | `server/src/routes/creations.ts` | 账号真实图片目录、查看、删除、附加聊天 | 真实 prompt 创建已接通，依赖后端图像模型配置；编辑、模板等完整工作流未对齐 |
| 网站、Artifacts、Canvas、图表与交互 Widget | `frontend/src/render/`、`server/src/routes/artifacts.ts`、`server/src/routes/creations.ts` | 尚有明显缺口 | 原生编辑器、预览运行、版本、发布、Mermaid/交互图表等未完整实现；没有用 WebView 套壳宣称原生对齐 |
| Codex/Agent 工作区 | `server/src/routes/agentRuns.ts`、Web 工作区 | 真实能力探测及状态说明 | 原生完整工作区、运行审批、文件编辑、终端、日志和版本差异未实现 |
| 语音 | `ui/VoiceInput.kt` | Android 真实语音输入、音量波形及设备 TTS 回复朗读 | 不等于 Web 服务端 TTS、双向实时通话、同声/打断等完整语音能力 |
| 设置与平台体验 | `packages/settings/`、Web 设置 | 连接、账号和服务商等已有入口 | 主题/多语言/通知/所有偏好、无障碍、真机键盘、离线与后台策略未全部对齐 |
| 管理员控制台 | 后端独立管理员会话与 Web 运营界面 | 不作为普通用户 API 调用 | 原生管理员界面未实现；不能绕过现有管理员权限边界 |

## 容易误判的契约

`POST /sessions` 返回的是标量摘要，不返回完整消息、`examData` 或教学计划。客户端必须把摘要合回原始会话，不能用摘要替换全部数据。

`tutorData` 的诊断题与选项在 Web/Expo 契约中本来就是本地字段，后端会剥离；服务器只同步支持的知识节点、计划、阶段等。Android 因此使用按服务器、已验证账号和会话隔离的本机加密草稿保存诊断，不声称诊断题跨设备同步。保存失败会显示错误和重试入口，不再忽略响应。

`GET /system-models` 属于独立管理员会话，不是普通用户的模型列表。普通用户服务商走 `/api-keys`，激活后由后端实际选路。

图片附件应使用真实 `mime`、大小与持久文件 ID；内联 `dataUrl` 有后端限制。跨端历史未知字段需要保留，不能只保存当前原生 UI 认识的字段。

## 验证边界

按要求没有继续设备验证。本轮仅执行本地源码构建、单元测试、静态检查、隔离数据库 HTTP 测试与模拟 API 的桌面浏览器回归；最新 Debug APK 对应此轮源码。Android App Links 的系统验证、真实 Chrome→原生跳转、生产账号、设备 UI 和逐像素一致性仍未验收。真实 release/Play 签名指纹缺失时服务端故意返回空关联，不假设线上已经可用。

测试目录中的 MockWebServer、测试账号、题目和附件仅用于自动化契约测试，不进入产品数据。部署服务支持相应端点，也不能代替生产环境验证。任何后续“完整功能对齐”结论必须以此清单逐项验收为条件。

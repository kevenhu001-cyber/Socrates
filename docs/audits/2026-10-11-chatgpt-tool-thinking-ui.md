# 工具执行与思考展示：ChatGPT 风格对齐分析

日期：2026-10-11。范围：`frontend/` SPA，以及产生过程信息的服务端流式协议。下文记录实施前的分析；首批实施内容见文末。

## 结论与证据范围

当前已经具备轻量工具行、每条回答的过程折叠入口、工具分组和独立成果展示。主要差距集中在信息组织、过程内容和状态转换：展开后重复列出工具，思考入口缺少实时公开摘要，来源与结论分离，结束前的摘要生成还会延长流式生命周期。

建议对齐的目标是：**正文优先；过程入口紧凑；公开摘要按阶段更新；工具细节点开可查；来源靠近相关结论；图表和文件独立展示。**

本地结论来自源码、构建和实际 Playwright 截图。当前没有连接可操作的用户浏览器，未核验登录后的 chatgpt.com Thinking、Search 或 Deep research 会话，也未做像素级对照。下文尺寸、箭头布局、分组行为是本项目的设计建议，不能视为 ChatGPT 当前所有模式的精确规格。

公开资料能够确认的边界：

- ChatGPT Web 的搜索结果和引用会出现在聊天中：[OpenAI Docs：Web search](https://learn.chatgpt.com/docs/web-search)。
- OpenAI API 的 reasoning summary 是公开摘要，与原始推理 token 区分；支持情况需要按模型判断：[Reasoning models](https://developers.openai.com/api/docs/guides/reasoning#reasoning-summaries)。这说明可采用的数据形式，不等于 chatgpt.com 内部实现。
- ChatGPT 插件 UI 指南强调系统配色、克制的字体层级、单色线性图标和一致间距：[UI guidelines](https://developers.openai.com/plugins/concepts/ui-guidelines)。这是视觉方向依据，不能替代实际会话截图。

## 当前可保留的基础

1. `AssistantTurn` 用同一个渲染模型处理流式回答和历史回答，工具按 `textOffset` 插入正文；未结束的段落会延迟挂载工具行，避免切碎文字。
2. `TurnSummaryPill` 已经是每条回答内的原生 `details/summary`，默认收起，支持键盘；用户展开后，不会因流式增量或完成而自动重置。
3. `AssistantTurn.shouldShowStatus` 会在真实工具行出现后收起额外的运行状态，避免状态行、工具行和光标同时提示同一项工作。
4. `ToolRunGroup` 将图表、文件等成果渲染在折叠列表之外；失败和待确认操作也保留可见入口。这些行为应继续保留。
5. 原始 `reasoningContent` 用于保存和提供商历史回放，UI 不直接显示；`TurnSegmentContent` 也不会展示原始 `<think>` 内容。现有方向适合公开摘要式展示。

关键入口：[AssistantTurn](../../frontend/src/react/tool-run/AssistantTurn.tsx)、[ToolRunGroup](../../frontend/src/react/tool-run/ToolRunGroup.tsx)、[ToolRunRows](../../frontend/src/react/tool-run/ToolRunRows.tsx)、[toolRunLayout](../../frontend/src/react/tool-run/toolRunLayout.ts)。

## 差异与对齐建议

| 项目 | 当前实现和实际效果 | 建议目标 | 主要落点 |
|---|---|---|---|
| 过程入口 | 固定“处理过程 / 思考完成”，整行宽度，箭头在最右侧。简单问答也可能因为有 `summary` 而显示入口 | 入口由真实工作决定；“已思考 12 秒 ›”“已搜索资料 ›”等短标题；箭头紧随标题，点击区继续满足尺寸要求 | `TurnSummaryPill.tsx`、`turnSummary.ts`、`thinking-activity.css` |
| 展开后的过程 | 一段摘要，再遍历所有 `toolCalls` 显示活动；正文中又显示相同工具 | 确定每个活动的唯一展示位置；公开摘要加可展开工具详情，避免同一个搜索出现两遍 | `TurnSummaryPill.tsx`、`AssistantTurn.tsx` |
| 思考内容 | 初始任务概括 + 结束后一句回顾；原始 reasoning 增量只触发“思考中”状态 | 支持公开的阶段摘要，例如“核对假设”“比较来源”；只有收到可展示摘要才追加内容 | `statusChrome.js`、`streamingTurn.js`、服务端 SSE |
| 运行中的视觉 | 橙色状态文字/工具图标；主要是工具图标呼吸，等待和思考文字本身没有对应动效 | 灰阶状态文字，可选低幅度文字 shimmer；完成后静止；失败继续明确可见 | `themes.css`、`tool-card.css`、`thinking-activity.css` |
| 工具分组 | 至少两个已结束成员才出现聚合标题；多个仍在运行的成员先显示独立行 | 按稳定的工具批次 ID 分组，减少结束时由多行切换为一行；保留并行任务的展开查看能力 | `toolRunLayout.ts`、`toolRunGroupModel.ts`、`ToolRunGroup.tsx` |
| 详情层级 | 过程 → 工具组 → 单工具 → 技术细节；工具组和单工具还可能重复显示来源 | 普通用户一层展开即可查看公开过程和结果；参数、stdout 等另放“查看执行详情” | `ToolRunRows.tsx`、`ToolRunDetail.tsx` |
| 搜索来源 | 工具行显示域名和数量；展开后看到来源，正文数字引用被主动移除 | 正文相关句子旁显示可信引用入口，并有统一来源列表；执行记录承担过程信息 | `assistantHtml.ts`、`helpers.ts`、搜索提示词与来源协议 |
| 执行文案 | `$ command`、文件名、动作数量和毫秒适合工作区任务，但在普通聊天中偏日志式 | 普通模式用“正在分析数据”“已读取文件”；实际命令保留在详情，工作区模式可继续显示 | `labels.ts`、`ToolRunRowHead.tsx` |
| 耗时 | 思考状态没有可靠的最终耗时展示；分组完成耗时是各工具 duration 相加 | 思考时长、工具执行时长分别记录；并行批次用实际起止时间，避免把累计执行时间当成用户等待时间 | `statusChrome.js`、消息契约、`toolRunGroupModel.ts` |
| 完成时机 | 最终回答后 `await generateTurnSummary`，最多 8 秒，再发送 finish | 核心回答完成即结束生成态；摘要优先复用已收到的公开内容或工具事实，后补摘要须有独立更新路径 | `runChatStreamPipeline.ts`、`turnSummary.ts` |

样式证据：`thinking-activity.css` 的 summary 为 `width: 100%`、label 为 `flex: 1`；`tool-card.css` 对工具标题采用相同布局。`themes.css` 的 `--ui-thinking-accent` 为橙色 HSL，完成的工具组图标则使用 `--ui-success`。

内容证据：`turnSummaryOf` 只依据 `summary`、是否存在 `reasoningContent` 和工具记录构建视图；`appendThinking` 保存原始推理，但不会把它转成公开阶段内容。服务端初始概括由 `generateInitialTaskSummary` 的规则生成，后续结束摘要由额外一次模型调用生成。

## 建议的展示行为

以下是对齐提案示意，文案和时间均为示例，不是截取的 ChatGPT UI：

```text
运行中，收起：
正在核对资料 ›

运行中，展开：
正在核对资料 ⌄
│ 比较不同来源对关键条件的说明。
│ 已搜索相关资料             查看来源
│ 正在读取原始文档…

完成，收起：
已思考 12 秒 ›

这是最终结论。 [来源名称]
[图表或文件成果]
```

具体规则：

- 没有推理和工具活动的快速回答，结束后不必保留通用“处理过程”入口。发送后仍应立即有生成反馈。
- 工具进入执行态时，切换同一个活动的标签，不额外新增一行“工具运行中”。实际并行工具可以有多条子活动，但不应复制同一任务的状态。
- 思考摘要与工具活动可以放在同一过程区域，但应区分“公开分析说明”和“已执行事实”；不能将初始任务概括描述为已经完成的分析。
- 正文中的阶段性解释仍按原顺序保留。适合收进过程区域的是执行元信息，不能把有用的说明和全部工具成果一起隐藏。
- 用户手动展开的区域保持展开；完成时只更新标题和状态，不强制收起，也不自动滚动到过程末尾。
- 普通状态以灰阶为主，失败信息继续可读。长搜索查询移入详情；移动端让主要动词和对象优先可见。
- 32px 桌面过程控制、44px 手机触控是当前组件已有的尺寸基础。紧凑视觉不等于缩小触控目标；手机目录等其他表面的密度保持其既有契约。

## 实施顺序

### 第一步：前端信息与视觉收敛

复用现有模型和组件，先处理紧凑标题、箭头距离、灰阶状态、活动去重和详情层数。普通模式收敛命令/耗时元信息，工作区模式继续保留必要执行信息。

需要先定义活动的唯一展示规则，再调整 JSX；不能只用 CSS 隐藏重复节点，否则键盘和辅助技术仍可能读到两套信息。工具结果、审批、错误的可见性保持原有语义。

普通问答的过程入口可根据真实 reasoning/tool 活动决定最终可见性。对于仅有摘要的旧会话，允许用户查看历史摘要，但不制造不存在的“已思考 N 秒”。

### 第二步：公开阶段摘要和完整时间模型

新增可选的过程字段/事件，概念上分为 `taskSummary`、`reasoningSummary`、`activity`、`turnOutcome`。名称可在实施时统一，但语义应区分初始任务、实时公开摘要和完成回顾。

当前前端 `onTurnSummary` 只提取文本，服务端发送的 `phase: 'initial'` 未进入展示模型。应保留阶段信息，避免初始概括与结束回顾覆盖同一个无类型 `summary`。

提供商原生支持 reasoning summary 时由适配器转换；没有支持时展示已有工具事实和合理的通用状态。不能直接把原始 `reasoningContent` 截取成公开“思考内容”，也不能把静态占位文案冒充实时模型分析。

记录真实阶段起止时间；历史记录没有时间时省略耗时。分组累计 duration 如需保留，应明确是累计执行时间。

解除结束摘要对 finish 的等待，需要同时处理存储与前端后补更新。不能先关闭 SSE，再试图通过已关闭的流发送摘要。最小方案是直接从本轮工具事实生成结束标题；更丰富的摘要可在独立事件/恢复查询路径内补齐。

字段增加应同步 `packages/contracts`、前端类型、服务端校验/存储投影、OpenAPI 和历史加载；以可选字段保证旧会话与旧客户端兼容。`mobile/` 已冻结，只检查兼容性；新跨端界面工作进入 `apps/socrates/` 和共享包。

### 第三步：引用和来源体验

这一步涉及产品数据结构，不只是给 `[1]` 加样式。当前服务端 `WEB_SEARCH_CITATION_GUIDANCE` 禁止数字引用和单独来源列表；前端 `format.ts`、`webSearch.js` 也有同方向提示，`assistantHtml.ts` 和 `messages.js` 会移除数字标记。

需建立稳定的来源 ID 与回答引用的关联，多次搜索不能各自使用 `[1]` 而在 UI 中混为同一个来源。优先使用提供商 annotations 或结构化引用，前端按经过校验的来源渲染引用入口；存在来源列表不代表每个来源都被读取或支撑了某条结论。

引用入口可以点开来源预览，手机采用触控可用的列表/弹层。没有明确来源对应关系时，保留普通 Markdown 链接或来源列表，不能推测某条结论来自哪个结果。

## 验证与约束

已完成：

- `frontend/ npm run build`，通过，包含 TypeScript 检查。
- `thinking-panel.spec.mjs` 7 个相关用例，通过；覆盖原始推理不显示、手动展开不重置、键盘、浅色/深色、桌面/手机。
- `tool-status-visual.spec.mjs` 2 个用例，通过；覆盖延迟工具行的状态移交和尾部运行工具去重。
- `tool-run-group.spec.mjs` 的 `the turn keeps one column...` 用例，通过，并查看展开/收起截图。

共 10 个 focused Playwright 用例通过。未修改产品源码，因此未跑全量单测或完整 Playwright。截图为本地、忽略的 `frontend/test-results/` 产物；其中 thinking-panel 的长文本是压力测试样例，不能当成普通回答的内容长度。

后续实现应按改动选择上述 focused specs 和 `test/thinkingPanel.test.mjs`、`test/toolRunModel.test.mjs`；涉及过程流式内容再补执行顺序、停止/重试、完成状态和历史重放覆盖。引用改动重点验证多次搜索的来源映射、无 annotations 的回退、代码/数学中的数字方括号、流式与最终渲染一致性。

所有新颜色仍由 `themes.css` 提供，组件 geometry 修改留在其所有者 CSS；不向 `legacy/` 或 `restore/` 添加新表面。保留无障碍展开状态、键盘操作和 reduced-motion。进入像素对齐阶段前，应固定一组 chatgpt.com 的实际参考会话及其模式、设备、语言和日期。

## 首批实施记录

- 过程入口改为内容宽度，去掉完成态的装饰图标；过程、工具和工具组的箭头紧随标题。
- 根据“阴影太大、按钮太大、仍不简洁”的反馈，进一步移除展开标题底色、结果卡片边框/底色及来源域名胶囊；次要操作改为文字按钮，收紧缩进和内边距，浅色输入框仅保留轻微边缘阴影。
- 运行状态与完成勾改用现有灰阶主题 token；等待和思考文字增加轻微 shimmer，reduced-motion 下恢复静态文字。
- 摘要内移除重复工具活动，工具仍按原正文顺序展示；手机长查询保持单行，完整信息继续可在工具详情查看。
- 客户端创建消息及 SSE 更新的初始任务预览统一写入临时 `_taskSummary`。快速回答完成后不会仅因预览而出现过程入口；历史 `summary` 继续兼容。
- 消息缓存比较新增公开摘要和任务预览字段，修复没有正文增量时过程内容不刷新的问题。
- 过程帧单独通知消息列表的活动通道，避免无正文/工具增量时仅更新存储而不刷新界面；原始推理内容变化不会单独触发无用重绘。
- 服务端完成摘要改为本轮实际工具数量、失败数量或分析完成事实；不再等待一次额外摘要模型请求。普通回答可没有完成摘要。
- OpenAPI 描述同步说明任务预览和完成回顾语义。SSE 数据形状保持兼容；共享 core 的旧客户端会忽略此可选事件。没有数据库迁移，回滚为恢复代码即可。

这批完成展示收敛和结束生命周期修正。模型原生公开阶段摘要、持久化精确思考耗时、稳定批次分组及正文引用/来源预览仍属于后续工作，没有把原始推理文本当作这些功能的替代品。

实施后验证：前端 build/lint（现有 ESLint warnings 保留，0 errors）、后端 typecheck、四个前端 focused 单测文件及服务端 `turnSummary.test.js` 通过。53 个相关 Playwright 用例分批通过：最终通知修复后重跑的 27 个思考/发送/停止/工具状态用例，加上已验证且未受该修复影响的 26 个主题/布局/工具分组用例。已查看新的桌面浅色与手机深色展开截图；截图用例同时断言标题和来源区域无填充、无卡片边框或阴影。验证使用本地 Chromium 与 mock API，未运行真实提供商或数据库端到端流程。

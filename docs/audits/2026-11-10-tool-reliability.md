# AI 工具调用可靠性治理：实际交付与验证

日期：2026-11-10。未部署、未推送、未修改数据库、未调用付费模型。

本次交付完成了原生控件的核心 P0 修复及部分 P1 改进，不代表整个专项全部验收。尤其是生产端九项指标、真实模型评测、按任务裁剪 schema、完整的原生表达式依赖分析仍未完成。固定输出回归不能证明真实模型首次生成成功率。

## 已证实的根因与修复

| 根因 / 具体入口 | 复现与原行为 | 修改后行为 | 测试 |
|---|---|---|---|
| `packages/core/src/intelligentUiValidation.js:validateIntelligentUi` 缺少原生控件专属校验；`IntelligenceUiNodes.tsx:UiSlider/UiChoice/UiToggle/UiTable/UiChart` 有静默 null 分支 | `{id:"speed",type:"slider",min:0,max:100}` 没有 bind 仍通过共享校验，浏览器不显示；空选项、无图表点等同类问题 | 共用 `intelligentUiControlIssues`，拒绝缺失绑定、无效范围/步长、重复选项、缺动作/标签、无效表格/点数据和 Tabs；返回节点 ID、字段路径和原因 | `intelligentUiReliability.test.js`；浏览器四种主题/尺寸组合 |
| 同一文档内错误节点导致合法兄弟节点一同丢失，历史节点本身无提示 | 完整 versioned 文档校验失败后解析器返回空；JSONL 控件单独解析后又可能返回 null | 安全/复杂度校验仍先执行；允许 control 类历史错误保留节点，由共享规则生成局部折叠诊断；有效兄弟组件和正文继续显示；when:false 仍有意隐藏 | 同上；既有历史学习卡隔离回归 |
| `IntelligenceUi.tsx:IntelligenceUiBlock` 完成后仍复用 PendingBlock | 已结束、无法解析或没有合法根的文档返回 null | 流式阶段维持骨架，结束后显示简短失败提示 | 浏览器第 5 项专项用例 |
| `UiTable` 把合法显式空行数组当成“不显示” | columns 合法、rows:[] 返回 null | 显示本地化“暂无数据”空状态；columns 缺失仍拒绝 | 服务端空表用例与浏览器测试 |
| 只校验 parent 存在/无环，没有验证容器是否渲染孩子、tab 是否存在 | text 放进 slider 子树，或 tab 指向不存在的标签，可能永不可见 | parent 必须是实际渲染 children 的容器；tab 必须属于直接 Tabs 父节点 | `unrendered children and nonexistent tabs…` |
| `toolErrorFeedback.ts:CANONICAL_EXAMPLES` 固定提供复杂物理演示；`intelligentUiFeedback.ts:exampleLine` 给原生图表错误提供 OpenUI 语法 | 修复 Slider/图表时接收到无关组件或另一套协议示例 | 通用例子改为最小文本；字段级拒绝根据失败节点种类选用已验证示例；原生图表提供 JSON，历史 OpenUI 保持位置参数语法 | 所有 14 个正式示例通过实际服务端校验；原生图表修复不含 `v = Visualization` |
| `intelligentUiNormalize.ts` 未恢复控件数字字符串/列表包装 | slider step:"0.5"、chart points:{item:…} 等确定性编码差异触发失败或空白 | 共享归一化仅转换已知位置数字及 item/items 包装；幂等；不补 bind、不猜正确答案或实验数据 | 归一化和安全 URL 回归 |
| `toolExecutors.ts:createToolRunner` 对任何执行失败都释放相同参数的重复保护 | 明确参数错误或副作用操作失败后仍允许同参数重新执行 | 只有明确 retryable 的纯工具失败且不属于参数/业务校验错误才释放；更改参数的修复仍可执行；不增加预算 | `canRetryIdenticalToolCall` 测试及取消、隔离、工具预算既有测试 |
| Windows 架构守卫 `checkServiceBoundaries` 用系统分隔符分割编译器规范化路径 | `/` 路径的 node_modules 被当成本地源码，继而把第三方声明中的 express 引用报告成业务逆向依赖 | 同时识别两种路径分隔符；保留第一方直接 express/React 依赖检查 | 架构守卫及 19 项测试 |

## 调用链与故障定位

实际链路为：`helpers.ts` / `chatPolicy.ts` / 前端 systemPrompts 装配上下文 → toolRegistry 与 toolContext 过滤可执行工具 → `llm.ts` 解析供应商流并累积原生调用 → `runChatStreamPipeline.ts` 解析参数、归一化和策略检查 → toolExecutors 调度 → intelligentUi 执行器和共享/专用验证 → SSE tool_result / UI 事件 → resultProjection 与附件投影 → IntelligenceUi/NativeVisualization 挂载 → 本地控件状态/动作。

当前已存在并被此次回归覆盖的区别包括 unknown_tool、tool_not_available、arguments_parse_failed、arguments_schema_failed、arguments_too_large、arguments_truncated、执行器异常、取消与预算/重复保护。组件业务错误保留兼容 errorCode，同时通过 detail.stage 区分 learning、visualization、demonstration、physics、OpenUI 语法/程序/截断，以及本次新增的 control；包含字段路径。客户端渲染异常已有 NativeVisualization 的 failed 阶段和 reportSwallow，不能把服务端 completed 直接当成渲染成功。

现有流式实现已有分片/累计参数、重复快照、多个 index/id、legacy function_call、stop、缺少 finish_reason、length、reasoning 回传及 400 兼容降级测试。本次运行这些 fixtures，没有改动未经供应商文档核验的模型能力表，也没有提高输出、字符数或失败次数上限。尚未证明所有代理实现均兼容。

## 代码修改清单

- `packages/core/src/intelligentUiControls.js`：控件字段校验、兼容归一化、模型指导文字。
- `packages/core/src/intelligentUiControls.d.ts`：上述 DOM-free 公共类型。
- `packages/core/src/intelligentUiValidation.js`：整合控件字段和 parent/tab 检查。
- `packages/core/src/intelligentUiValidation.d.ts`：control 错误类型。
- `packages/core/src/index.ts`：公共校验与归一化导出。
- `packages/core/src/intelligenceUi.ts`：共用归一化、隔离历史控件错误。
- `server/src/services/intelligentUiNormalize.ts`：服务端共用同一控件归一化。
- `server/src/services/intelligentUi.ts`：共享指导、失败组件元数据、修正图表必填说明与表格行数声明。
- `server/src/services/intelligentUiExamples.ts`：14 个小型、可校验示例。
- `server/src/services/intelligentUiFeedback.ts`：control 阶段、按类型修复示例、原生图表 JSON 示例。
- `server/src/services/tools/toolErrorFeedback.ts`：取消通用复杂物理示例。
- `server/src/routes/chat/pipeline/toolResultPolicy.ts`：同参数重试条件。
- `server/src/routes/chat/pipeline/toolExecutors.ts`：应用重试条件。
- `frontend/src/react/intelligence-ui/IntelligenceUi.tsx`：完成后文档失败提示。
- `frontend/src/react/intelligence-ui/IntelligenceUiNodes.tsx`：局部字段诊断、空表状态。
- `frontend/src/react/intelligence-ui/IntelligenceUiFailureCard.tsx`：control 专用修复指导。
- `frontend/src/i18n/en.ts`、`frontend/src/i18n/zh.ts`：错误、详情、空数据文案。
- `server/test/intelligentUiReliability.test.js`：专项固定输入与精确断言、服务端验收浏览器 fixture。
- `server/test/toolErrorFeedback.test.js`：更新通用例子断言。
- `frontend/e2e/fixtures/intelligent-ui-controls.mjs`：服务端/浏览器共用控件数据。
- `frontend/e2e/intelligent-ui-reliability.spec.mjs`：实际挂载、交互、错误与正文保留。
- `server/scripts/check-service-boundaries.mjs`、`server/test/serviceBoundaries.test.mjs`：Windows 守卫修复与回归。
- 本报告。

## 实际验证结果

| 命令（在对应目录执行） | 通过 | 失败 | 跳过 |
|---|---:|---:|---:|
| server: `npx tsx --tsconfig ../frontend/tsconfig.test.json --import ./scripts/test-env.mjs --test test/intelligentUi.test.js test/intelligentUiReliability.test.js test/toolArgumentRecovery.test.js test/toolCallSafety.test.js test/toolErrorFeedback.test.js test/toolTurnPolicy.test.js test/visualizationReliability.test.js test/llm.test.js test/llmProtocol.test.mjs test/llmStreamLifecycle.test.js test/toolRunnerTelemetry.test.js test/toolRunnerCancellation.test.js` | 249 | 0 | 0 |
| server: `node --import tsx --test test/serviceBoundaries.test.mjs` | 19 | 0 | 0 |
| frontend: `npx tsx --tsconfig tsconfig.test.json --test test/intelligentUi.test.mjs test/openUi.test.mjs test/toolRuntime.test.mjs test/toolOutputs.test.mjs` | 52 | 0 | 0 |
| frontend: `npx playwright test --config=playwright.config.mjs e2e/intelligent-ui-reliability.spec.mjs e2e/intelligent-ui-learning.spec.mjs e2e/openui.spec.mjs --workers=1` | 33 | 0 | 0 |
| 最终前端修复后的专项重跑：`npx playwright test --config=playwright.config.mjs e2e/intelligent-ui-reliability.spec.mjs --workers=1` | 5 | 0 | 0 |

两次浏览器运行重叠 4 项，共 34 个不同用例；不能相加宣称 38 个独立场景。最终修复服务端示例后，重新运行了整组 249 项服务端测试。服务端 `npm run typecheck`、`npm run build`、`npm run lint:boundaries`，前端 `npm run lint`、`npm run build`、bundle-size 守卫，共享 core `tsc --noEmit -p packages/core/tsconfig.json` 和 `git diff --check` 均通过。

验证中遇到并解决：直接 strip-types 缺少仓库 TS 路径解析，改用既有 tsx 配置；server 供应商测试导入前端时也需要其 tsconfig 路径映射；新图表示例缺少服务端要求的标题/摘要，补全后通过；截图路径守卫需要 encodeURIComponent；浏览器选择器应为 `.visualization-card`；沙箱拒绝本机连接 EACCES，获工具授权后运行本机 Chromium。以上均不是最终未解决失败。

浏览器环境：生产 dist，`http://127.0.0.1:4173`，Chromium，1280×1000 与 390×1000，light/dark。Browser 插件不可用，使用仓库 Playwright。实际操作后断言状态和可见输出；检查无全局错误，图表可见，无框架错误遮罩；人工检查了浅色桌面与深色手机截图。截图与 trace 保留在被忽略的 test-results 下，不提交构建或测试产物。

## 可靠性评测与未解决范围

| 真实模型指标 | 修改前 | 修改后 |
|---|---|---|
| 首次校验通过率 | 未测试 | 未测试 |
| 组件渲染成功率 | 未测试 | 未测试 |
| 最终工具成功率 | 未测试 | 未测试 |
| 平均重试次数 | 未测试 | 未测试 |
| 平均 Token / 费用 | 未测试 | 未测试 |

已有的 visualizationValidation / toolOutcome 统计继续工作，测试证明 control 校验阶段可进入现有可视化拒绝指标；但没有完成用户要求的九项生产指标，也没有补齐 model/provider/component 维度或前端 render/interaction 观测回传。不能将现有计数器声称为已交付的完整可靠性平台。

仍需完成：

1. 所有原生节点的表达式语义、声明引用和初始状态一致性分析。当前已检查控件形状和部分表达式类别，不能证明任意动态表达式可运行；非控件内容节点的空白语义没有全面收紧。
2. 模型 schema 仍是兼容供应商的宽对象，新增共享准确指导和经过测试的示例，未引入未经核验的 oneOf/discriminator，也未实现按任务裁剪完整协议。需通过供应商契约 fixtures 和受控真实调用后再切换。
3. 未增加独立的真实模型评测驱动器及长期指标采集；需在明确预算和凭据用途后建立前后对照。
4. 本次未改写供应商降级、输出 token 预算、部分成功的跨调用合并或工具卡片状态机；现有覆盖不等于所有这些要求已满足。原生 Function Calling 不支持时的显式上层通知仍须专项验收。
5. 错误阶段可观察，但前端渲染错误与服务端调用的完整关联指标及错误去重状态机仍需补齐。
6. Universal App 和独立 Android 没有设备回归。未改变消息 wire 字段和 OpenAPI 形状；共享包保持 DOM-free。新增校验会明确拒绝以前静默截断/空白的无效控件；表格仍保留空行语义、含空格的列键和历史 OpenUI 支持。依赖动态 URL 的按钮现在要求可验证的绝对 HTTP(S) URL，这是保守收紧。
7. 同参数重试只为纯工具开放；非纯工具若确实需要安全重试，应有明确幂等键和执行状态查询，不能直接释放重复保护。

## 结论

已证实的问题是协议校验与实际渲染有缺口、修复指导跨组件协议、确定性编码差异，以及失败后重复保护释放过宽。此次通过共享规则、局部失败提示、真实浏览器交互和按种类修复示例消除了这些确定性来源。没有以增加重试次数、放松安全检查或提高输出上限掩盖问题。真实模型生成质量、生产指标和剩余架构工作尚待完成，不能据固定 fixture 的绿测宣称首次调用可靠性达到某个百分比。

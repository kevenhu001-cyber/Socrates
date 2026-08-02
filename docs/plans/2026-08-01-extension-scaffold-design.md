# 扩展脚手架设计(Extension Scaffold Design)

> 日期:2026-08-01
> 范围:`frontend/src/` 的扩展(Extensions)子系统
> 状态:设计评审稿 —— 评审通过后按本文档实施

## 1. 现状与问题

当前扩展功能散落在三个命令式模块中,每个扩展都是重复的 `window.xxxAction = function(){...}` 模式:

| 位置 | 内容 | 问题 |
|---|---|---|
| `frontend/src/windowExports.js` | `composeAction` / `researchAction` / `exploreAction` / `deepResearchAction` / `analyzeAction` 五个硬编码函数,内嵌 SVG 图标与 system prompt | 提示词与 UI 耦合在 window 全局函数里;无类型;无法测试 |
| `frontend/src/pickers.js` | `EXTENSIONS` 数组(extensiveThinking / deepResearch / exam)+ `toggleExtensionByKey` | 数组元素结构未统一(onChange 内联副作用);与工具菜单定义重复 |
| `frontend/src/main.js` | `EXTENSION_SIDE_EFFECTS` 映射(webSearch / deepResearch / extensiveThinking)+ `_activeTemplate` 状态 + `renderTemplateModeChip` | 副作用表与扩展定义分离,新增扩展容易漏改 |

三个 UI 表面(工具菜单 8 项、扩展选择器 3 项、编辑器内 token chip)各自维护一份定义,同一扩展在菜单与选择器中重复出现(deepResearch、exam)时逻辑分叉。

### 扩展清单(现状盘点)

| key | 名称 | kind | 出现位置 | 副作用 | 备注 |
|---|---|---|---|---|---|
| `upload` | Add files | action | 工具菜单 | 打开附件选择器 | 非模板 |
| `write` | Write & edit | template | 工具菜单 | — | `/write`,含 system prompt |
| `research` | Find sources | template | 工具菜单 | `webSearch` 置开 | `/research`,含 prompt |
| `explore` | Explore | template | 工具菜单 | `webSearch` 置开 | `/explore`,含 prompt |
| `deepResearch` | Deep research | toggle+template | 工具菜单 + 扩展选择器 | `window.deepResearchOn`;有内容时自动启动 | `/research` |
| `analyze` | Analyze data | template | 工具菜单 | — | `/analyze`,含 prompt |
| `exam` | Generate exam | action | 工具菜单 + 扩展选择器 | 打开 Exam 面板 | 无 `.on` 态 |
| `extensiveThinking` | Extensive thinking | toggle | 扩展选择器 | `window.extensiveThinkingOn` + localStorage | 空 prompt,仅提示词模式 |
| `skills` | Skills & shortcuts | action | 工具菜单 | 打开模板管理弹窗 | 非模板 |

## 2. 设计目标

1. **单一声明式脚手架**:一个 `ExtensionDefinition` 类型 + 一个注册表,覆盖所有扩展。
2. **每个扩展一个功能模块**:提示词、图标、i18n、副作用、激活逻辑收敛到独立模块文件,可单测。
3. **行为不变**:迁移后 UI 表现、快捷键、发送管线、token chip 完全一致。
4. **类型安全**:TS 严格模式;React 菜单渲染器与 legacy picker 共享同一注册表。
5. **可扩展**:新增扩展 = 新增一个模块文件 + 注册一行,不改任何菜单渲染代码。

## 3. 统一脚手架

### 3.1 核心类型(`frontend/src/extensions/types.ts`)

```ts
/** 扩展激活后的行为种类 */
export type ExtensionKind = 'template' | 'toggle' | 'action';

/** 菜单归属与排序 */
export interface ExtensionPlacement {
  tools?: number;        // 工具菜单("+")中的顺序;缺省则不出现
  picker?: number;       // 扩展选择器中的顺序;缺省则不出现
}

/** 一个扩展的完整声明 */
export interface ExtensionDefinition {
  key: string;                       // 规范 id,贯穿菜单/token/副作用/快捷键
  kind: ExtensionKind;
  nameKey: string;                   // i18n key
  nameFallback: string;
  descriptionKey?: string;           // 菜单副标题 i18n key
  descriptionFallback?: string;
  hintKey?: string;                  // token chip 提示语 i18n key
  hintFallback?: string;
  icon: string;                      // 内联 SVG(单一来源,菜单与 token 共用)
  shortcut?: string;                 // 如 "/write"
  // —— 仅 template kind ——
  systemPrompt?: string | ((ctx: ExtensionContext) => string);
  body?: string;                     // 预填正文(通常为空)
  // —— 激活/去激活副作用(替代 main.js 的 EXTENSION_SIDE_EFFECTS)——
  onActivate?: (ctx: ExtensionContext) => void;
  onDeactivate?: (ctx: ExtensionContext) => void;
  // —— 行为开关 ——
  autoFocus?: boolean;               // 激活后聚焦 composer(默认 true)
  autoLaunch?: boolean;              // deepResearch: 已有内容时自动启动
  placement: ExtensionPlacement;
}

/** 扩展可调用的运行环境(由 legacy 桥接实现) */
export interface ExtensionContext {
  surface: 'chat' | 'topic';
  /** 激活模板(包装 legacy setActiveTemplate,统一副作用时序) */
  setTemplate(def: Pick<ExtensionDefinition, 'key'|'nameKey'|'nameFallback'|'icon'|'hintKey'|'hintFallback'|'systemPrompt'|'body'>): void;
  clearTemplate(): void;
  focusComposer(surface?: 'chat' | 'topic'): void;
  getMarkdown(surface?: 'chat' | 'topic'): string;
  t(key: string, fallback: string): string;
  toast(message: string): void;
  /** exam 专用 */
  openNav?(page: string): void;
  /** 打开模板管理弹窗(skills 专用) */
  openPromptTemplatesModal?(): void;
  /** 打开附件选择器(upload 专用) */
  openAttachmentPicker?(mode: 'topic' | 'chat'): void;
}
```

### 3.2 注册表(`frontend/src/extensions/registry.ts`)

```ts
export class ExtensionRegistry {
  private map = new Map<string, ExtensionDefinition>();
  register(def: ExtensionDefinition): this;         // 校验 key 唯一、kind 必填字段完整
  get(key: string): ExtensionDefinition | undefined;
  byPlacement(placement: 'tools' | 'picker'): ExtensionDefinition[];  // 按 order 升序
  has(key: string): boolean;
}
export const registry = new ExtensionRegistry();
```

`byPlacement` 供三个消费者共用:React 工具菜单(`ComposerToolsMenu.tsx`)、legacy 扩展选择器(`pickers.js`)、以及未来的键盘快捷键表。

### 3.3 模块布局

```
frontend/src/extensions/
├── types.ts            # ExtensionDefinition / ExtensionContext / ExtensionPlacement
├── registry.ts         # ExtensionRegistry 单例 + 注册函数
├── context.ts          # buildExtensionContext(): 包装 legacy window.* 为 ExtensionContext
├── index.ts            # installExtensions(): 依次 import 各模块并注册;导出注册表
└── modules/
    ├── upload.ts
    ├── write.ts
    ├── research.ts
    ├── explore.ts
    ├── deepResearch.ts
    ├── analyze.ts
    ├── exam.ts
    ├── extensiveThinking.ts
    └── skills.ts
```

每个模块 `export const writeExtension: ExtensionDefinition = {...}`。`modules/` 只声明数据与纯副作用函数,不直接触碰 DOM;DOM 副作用经由 `ExtensionContext` 完成,保证可测。

## 4. 每个扩展的功能模块设计

### 4.1 `write` — Write & edit(template)

- **激活**:`ctx.setTemplate(...)`,system prompt 迁移自 `windowExports.js` 的 `WRITE_EDIT_SYSTEM_PROMPT`(撰写/编辑规则、最多 2 个澄清问题、保留用户语气、Markdown 结构、无开场白)。
- **副作用**:无。
- **行为**:`autoFocus: true`;激活后刷新发送/开始按钮状态(迁移 `updateStartBtn`/`updateSendBtn` 调用)。
- **i18n**:`composer.write` / `composer.writeHint`。
- **测试**:prompt 迁移后字节一致;激活后 `_activeTemplate.extensionKey === 'write'`;快捷键 `/write` 命中。

### 4.2 `research` — Find sources(template)

- **激活**:`ctx.setTemplate(...)`,prompt 迁移自 `SOURCE_RESEARCH_SYSTEM_PROMPT`(证据任务四步:精确化 → web_search → 对比 → 结论 + "仍不确定"章节;禁止虚构引用;场景过大时推荐 Deep research)。
- **副作用**:`onActivate` → 打开 web 搜索(`EXTENSION_SIDE_EFFECTS.webSearch` 逻辑迁入);`onDeactivate` → 关闭。注意:与 `explore` 共享 `webSearch` 键,二者互斥激活时先关后开,语义与现状一致。
- **行为**:`autoFocus: true`;`syncQuickChips()` 同步快速操作 chip。
- **i18n**:`composer.research` / `composer.researchHint`。
- **测试**:激活/去激活时 `webSearchOn` 翻转;与 explore 互斥;prompt 迁移一致。

### 4.3 `explore` — Explore(template)

- **激活**:prompt 迁移自 `EXPLORE_SYSTEM_PROMPT`(四阶段:Scope → Search → Integrate → Deliver;子问题拆分、双来源佐证、可下载文档时用 code_interpreter 出产物)。
- **副作用**:同 `research`,共享 `webSearch` 键。
- **行为**:`autoFocus: true`;`syncQuickChips()`。
- **i18n**:`composer.explore` / `composer.exploreHint`。
- **测试**:激活打开 webSearch;prompt 阶段完整性断言。

### 4.4 `deepResearch` — Deep research(toggle + template)

- **激活**:`setTemplate`(空 prompt,仅模式标记);副作用置 `window.deepResearchOn = true` 并 `syncQuickChips()`;若 `ctx.getMarkdown(surface).trim()` 非空且 `launchDeepResearch` 可用则 `autoLaunch` 启动,否则 `focusComposer` + toast 提示输入主题。
- **去激活**:`window.deepResearchOn = false` + `syncQuickChips()`。
- **双入口**:同时出现在工具菜单与扩展选择器,但共享同一 `ExtensionDefinition`(通过 `placement: { tools: 4, picker: 1 }`),消除现有 `pickers.js` 与 `windowExports.js` 两处定义的分叉。
- **i18n**:`composer.deepResearch` / `composer.deepResearchHint`。
- **测试**:激活/去激活翻转 `deepResearchOn`;已有内容时触发 `launchDeepResearch`;空内容时仅聚焦 + toast。

### 4.5 `analyze` — Analyze data(template)

- **激活**:prompt 迁移自 `DATA_ANALYSIS_SYSTEM_PROMPT`(先审查 schema/单位/缺失值 → 最小有效方法 → code_interpreter + render_visualization → 报告假设与 caveat;禁止声称未运行的运算)。
- **副作用**:无。
- **行为**:`autoFocus: true`。
- **i18n**:`composer.analyze` / `composer.analyzeHint`。
- **测试**:prompt 迁移一致;激活聚焦。

### 4.6 `exam` — Generate exam(action)

- **激活**:`kind: 'action'`,不设置模板、无 `.on` 态;`ctx.openNav('exam')`(链式回退 openExamPanel → openExamModal)。
- **双入口**:工具菜单 + 扩展选择器共用。
- **i18n**:`composer.exam` / `composer.examHint`。
- **测试**:激活调用 openNav;不污染 `_activeTemplate`;选择器 `.on` 保持 false。

### 4.7 `extensiveThinking` — Extensive thinking(toggle)

- **激活**:置 `window.extensiveThinkingOn = true` + localStorage(`socrates-extensive-thinking`);`setTemplate` 空 prompt 模板(extensionKey 自身),hint 用 `effort.high.note`。
- **去激活**:仅当当前 `_activeTemplate.extensionKey === 'extensiveThinking'` 时 `clearTemplate()`(现有守卫语义保留)。
- **i18n**:`effort.high.note`。
- **测试**:localStorage 往返;`syncExtensionsUI` 后 `.on` 状态;仅清除自己激活的模板。

### 4.8 `upload` — Add files(action)

- **激活**:`kind: 'action'`;`ctx.openAttachmentPicker(surface === 'topic' ? 'topicAttachInput' : 'attachInput')`。
- **i18n**:`composer.menu.upload` / `composer.menu.uploadHint`。
- **测试**:激活按 surface 选择正确的 input id。

### 4.9 `skills` — Skills & shortcuts(action)

- **激活**:`ctx.openPromptTemplatesModal()`。
- **i18n**:`composer.menu.skills` / `composer.menu.skillsHint`。
- **测试**:激活调用弹窗。

## 5. 状态管理

| 状态 | 归属 | 说明 |
|---|---|---|
| `_activeTemplate` | `main.js`(不变) | 单一激活模板;模板类型扩展通过 `setActiveTemplate` 写入 |
| `window.deepResearchOn` / `window.webSearchOn` / `window.extensiveThinkingOn` | legacy 全局(不变) | 发送管线(`submitChatMessage`/`startSession`)读取同一批全局;副作用集中到 `onActivate/onDeactivate` 后,时序保证"去激活旧 → 激活新" |
| localStorage `socrates-extensive-thinking` | `extensiveThinking` 模块 | 持久化开关 |
| token chip | `renderTemplateModeChip` → `setComposerExtensionToken`(不变) | 编辑器内 token 由 `_activeTemplate` 驱动,与注册表无关 |

**关键约定**:`setTemplate` 在 `context.ts` 中的实现负责合并副作用时序(先 `onDeactivate(prev)` 再 `onActivate(next)`),将 `main.js` 里 `_applyExtensionSideEffects` 的职责前移到上下文层,使模块的 `onActivate/onDeactivate` 成为唯一副作用出口。

## 6. 集成点(改造清单)

| 集成点 | 现状 | 改造后 |
|---|---|---|
| `windowExports.js` | 5 个硬编码 `*Action` | 删除;保留 5 个 window 函数为一行委托(`window.composeAction = () => registry.get('write')!.activate(...)`),避免外部 inline handler 失效 |
| `pickers.js` `EXTENSIONS` | 手工数组 + 内联 onChange | 由 `registry.byPlacement('picker')` 派生;保留 `toggleExtensionByKey` 委托到注册表 |
| `main.js` `EXTENSION_SIDE_EFFECTS` | 手工映射 | 删除;逻辑迁入各模块 `onActivate/onDeactivate` |
| `ComposerToolsMenu.tsx` | 硬编码 `ITEMS` 数组 | 由 `registry.byPlacement('tools')` 派生(图标、文案、顺序一致) |
| `composerTools.js` | 硬编码 HTML 菜单项 | 保留为 non-React 兜底,但内容改为注册表快照(与 React 渲染器一致) |

**兼容性红线**:任何 `window.*Action` 仍须存在于 window 上(legacy `delegate.js` 与 inline handler 引用);改造后改为薄委托,签名不变。

## 7. 迁移路径

1. **Phase 1 — 脚手架落地**:新增 `frontend/src/extensions/` 目录与 `types.ts`/`registry.ts`/`context.ts`;9 个模块文件从现有实现原样搬运(提示词字符串、图标、副作用逻辑),`windowExports.js`/`pickers.js` 暂不动。
2. **Phase 2 — 接线**:菜单与选择器改为读取注册表;`EXTENSION_SIDE_EFFECTS` 删除;window 函数改为委托。此阶段后行为与现状完全一致(逐项对照上表验证)。
3. **Phase 3 — 测试与收尾**:为每个模块补单测(激活/去激活/副作用/i18n);`npm run typecheck` + `npm run build`;Playwright smoke 确认菜单点击、token chip、快捷键回归。
4. **Phase 4(可选)**:由注册表生成快捷键表,统一 `/write` 等 slash 命令与菜单注册。

## 8. 验证清单

- [ ] `npm run typecheck` 通过(严格模式)
- [ ] `npm run build` 通过
- [ ] 每个扩展模块至少一个单测(激活/去激活/副作用)
- [ ] 菜单 8 项顺序与文案与现状逐项一致
- [ ] 扩展选择器 3 项行为一致(extensiveThinking 持久化、deepResearch 自动启动、exam 打开面板)
- [ ] token chip 激活/移除与 `_activeTemplate` 同步
- [ ] Playwright:点菜单每项 → 断言 chip/焦点/面板表现
- [ ] `prefers-reduced-motion` 下无动画回归

## 9. 参考文件

- `frontend/src/windowExports.js`(435–577 行,五个 Action 与提示词)
- `frontend/src/pickers.js`(248–430 行,EXTENSIONS 与扩展选择器)
- `frontend/src/main.js`(3512–3591 行,`_activeTemplate` 与 `EXTENSION_SIDE_EFFECTS`)
- `frontend/src/react/composer/ComposerToolsMenu.tsx`(工具菜单 React 渲染器)
- `frontend/src/ui/composerTools.js`(工具菜单 legacy 兜底)
- `frontend/src/react/composer-input/extensionToken.ts`(编辑器内 token 节点)

---

## 10. 结构化工作流事件(Phase 2 — 实施追加)

### 10.1 目标

让 UI 组件(ExploreStepper、AnalyzeWorkbench 等)能订阅"研究/探索/深度研究/分析"这类多阶段工作流的实时进度,而不是只看到最终结果。核心思路:在工作流的关键节点发布 `AgentRunEvent` 到一个全局事件 store,React 组件通过 `useSyncExternalStore` 订阅渲染。

### 10.2 事件契约(`AgentRunEvent`)

```ts
export interface AgentRunEvent {
  runId: string;        // 一次工作流运行的唯一 id
  workflow: 'explore' | 'deepResearch' | 'research' | 'analyze';
  stage: 'planning' | 'searching' | 'reading' | 'synthesizing' | 'completed' | 'failed';
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  current?: number;     // 进度(已完成的步骤数)
  total?: number;       // 进度(总步骤数)
  message?: string;     // 阶段描述
  toolCallIds?: string[]; // 当前阶段涉及的工具调用 id
}
```

`workflow` 联合中加入 `'analyze'` 是因为 analyze 走 code_interpreter 工具链,需要展示工具调用表(AnalyzeWorkbench);其他三类的词表未变。

### 10.3 runId 透传机制

工作流跨"扩展激活"和"聊天管线"两个阶段。需要在扩展 `onActivate` 时生成 runId,并让后续聊天管线在发布 searching/reading/completed 时复用同一个 runId,以便 UI 组件能关联同一会话。

实现方式:在 `ExtensionContext.setTemplate` 中增加两个可选字段:

```ts
setTemplate(spec: TemplateChipSpec & {
  systemPrompt: string;
  body?: string;
  shortcut?: string;
  runId?: string;                                                   // 新增
  workflow?: 'explore' | 'deepResearch' | 'research' | 'analyze';   // 新增
}): void;
```

`main.js` 的 `setActiveTemplate` 接收这两个字段并存入 `_activeTemplate`,聊天管线(`toolCallbacksForStream` / `askChatTurn` / `handleChatApiResult`)在读取 `_activeTemplate` 时拿到 `runId` 与 `workflow`,据此发布事件。

扩展模块端(research / explore / analyze)的 `onActivate`:

```ts
const runId = generateRunId();
ctx.setTemplate({ ...chip, systemPrompt, runId, workflow: 'research' });
ctx.publishAgentRun({ runId, workflow: 'research', stage: 'planning', status: 'running', message: '...' });
```

deepResearch 的生命周期由 `researchAgent.js` 的 `startDeepResearch` 全程发布(planning → searching → reading → synthesizing → completed/failed),无需 runId 透传。

### 10.4 AgentRunStore + Bridge

`frontend/src/extensions/agentRunStore.ts` 实现一个最小事件 store:

```ts
type Snapshot = { event: AgentRunEvent | null; ts: number };
const listeners = new Set<() => void>();
let snapshot: Snapshot = { event: null, ts: 0 };

export function getAgentRunSnapshot(): Snapshot { return snapshot; }
export function subscribeToAgentRuns(fn: () => void): () => void { /* ... */ }
export function publishAgentRun(event: AgentRunEvent): void {
  snapshot = { event, ts: Date.now() };
  listeners.forEach(fn => fn());
}
```

`installAgentRunBridge()` 在 `extensions/index.ts` 中调用,把 `publishAgentRun` 暴露到 `window.__socratesAgentRunBridge`,供测试与 legacy 代码调用。

React 组件订阅模式:

```ts
const snapshot = useSyncExternalStore(
  subscribeToAgentRuns,
  getAgentRunSnapshot,
  getAgentRunSnapshot,
);
```

### 10.5 主线接线点

| 阶段 | 发布位置 | 事件 |
|---|---|---|
| 扩展激活 | `research.ts` / `explore.ts` / `analyze.ts` `onActivate` | `stage: 'planning'` |
| 聊天管线工具调用 | `main.js` `toolCallbacksForStream.onToolUse` / `onToolResult` | `stage: 'searching'` / `'reading'` |
| 聊天内联工具 | `main.js` `askChatTurn` 内联 tool 回调 | `stage: 'searching'` / `'reading'` |
| 聊天完成 | `main.js` `handleChatApiResult` 提交后 | `stage: 'completed'` |
| deepResearch 全程 | `researchAgent.js` `startDeepResearch` + `_publishRun` | 全部 6 个阶段 |

`main.js` 新增两个 helper:

```ts
function publishActiveWorkflowEvent(stage, status, extra) { /* 读 _activeTemplate → publish */ }
function publishActiveWorkflowFinish(ok) { /* completed/failed */ }
```

### 10.6 UI 组件

| 组件 | 文件 | 职责 |
|---|---|---|
| `ExploreStepper` | `frontend/src/react/extensions/ExploreStepper.tsx` | 4 阶段进度条(planning → searching → reading → synthesizing),completed/failed 末期样式 |
| `AnalyzeWorkbench` | `frontend/src/react/extensions/AnalyzeWorkbench.tsx` | 工具调用列表(从 `window.state.session.messages` 读 toolCalls),展示 name / phase / input 摘要 / output 摘要 |
| `WorkflowLayer` | `frontend/src/react/extensions/WorkflowLayer.tsx` | 组合上两者,按 `event.workflow` 分发;completed/failed 后 1600ms 自动隐藏(`.workflow-layer-done` + fade 动画) |

所有组件均通过 `useSyncExternalStore` 订阅 `agentRunStore`,无 props、无 ref-only 副作用。

### 10.7 挂载位置

挂载点:**`#appShell` 内,作为 `<main>` 的兄弟节点**。不挂在 `#chatView` 内,因为 `#chatView` 在用户切换到 library / projects / plugins / exam 等面板时会被 `display: none` 隐藏,导致浮层跟着消失。

代码位置:`frontend/src/react/bootstrap.tsx` 的 `bootstrapReactCompatibilityRuntime()` 末尾:

```ts
const appShell = document.getElementById('appShell');
if (appShell && !document.getElementById('workflowLayerReactRoot')) {
  const host = document.createElement('div');
  host.id = 'workflowLayerReactRoot';
  host.setAttribute('data-react-migration-runtime', 'workflow-layer');
  appShell.appendChild(host);
  const workflowRoot = createRoot(host);
  workflowRoot.render(<ErrorBoundary><WorkflowLayer /></ErrorBoundary>);
}
```

CSS 用 `position: sticky; bottom: 8px` 让浮层贴齐视口底部,与聊天输入栏视觉对齐(虽然 DOM 位置不同)。

### 10.8 验证

- `frontend/test/extensions.test.mjs` 新增 `research/explore onActivate publish planning with a shared runId` 覆盖三个模块(research/explore/analyze)的 runId 与 setTemplate 同步(46/46 通过)。
- `frontend/e2e/workflow-layer.spec.mjs` 新增 3 个冒烟测试:research planning → stepper 出现、searching → 阶段推进、completed → 隐藏;analyze planning → workbench 出现。
- `npx tsc --noEmit` exit 0;`NODE_OPTIONS=--max-old-space-size=3072 npm run build` exit 0;`npm run test:unit` 46/46 pass;Playwright 串行回归 11/12 通过(唯一失败 = 既有 WIP token 高度断言,与本改动无关)。

---

## 11. exam 真 toggle(Phase 2 — 实施追加)

### 11.1 目标

`exam` 扩展从单次"打开"改为真正的 toggle:再次点击关闭面板(`closeExamView`);另一个扩展激活时(`onDeactivate`)关闭面板作为兜底。liveness 信号用 `state._examInView`,取消信号用 `state.examCancel`(两者均由 `closeExamView()` 同步写)。

### 11.2 实现

`frontend/src/extensions/modules/exam.ts`:

```ts
onActivate(ctx) {
  const w = window as unknown as ExamWindow;
  const inView = !!w.state?._examInView;
  if (inView && typeof w.closeExamView === 'function') {
    w.closeExamView();           // toggle off: 关闭面板 + 触发 examCancel
    return;
  }
  if (ctx.openNav) ctx.openNav('exam');
  else if (typeof w.openExamPanel === 'function') w.openExamPanel();
  else if (typeof w.openExamModal === 'function') w.openExamModal();
},
onDeactivate() {
  // 兜底:另一个扩展接手时关闭 exam 面板
  const w = window as unknown as ExamWindow;
  if (w.state?._examInView && typeof w.closeExamView === 'function') {
    w.closeExamView();
  }
},
```

`closeExamView()` 已经实现 `state.examCancel = true` + `state._examInView = false`,无需在扩展模块里直接写这两个字段。

### 11.3 验证

- `npm run lint` (tsc) exit 0;`npm run test:unit` 46/46 pass。
- 与既有 `exam-regressions.spec.mjs` 兼容(未改动 `closeExamView` 本身)。

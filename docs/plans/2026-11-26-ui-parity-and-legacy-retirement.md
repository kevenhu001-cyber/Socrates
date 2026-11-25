# 2026-11-26 UI 对标与旧样式退役计划

基线：`3759ceb3a`（`refactor(web): converge UI ownership and retire legacy chrome (#231)`）。
范围：`frontend/` 的 SPA 外壳、聊天工作台、页面体系、主题变量、DOM 兼容接口与
`styles/restore/`。本文是计划，不是完成状态；落地后结论回写 `docs/architecture/`。

## 1. 结论

聊天主工作台已经达到 ChatGPT 同级几何：768px 消息列、16/28 正文、composer 与消息列同宽、
260/52 侧栏、52px 顶栏、36px 桌面行高、32px 消息操作、28px composer 胶囊。最近四个提交
（#227–#231）已经把思考/工具活动、子页面、页面体系和外壳所有权收敛到同一套语法。

**不需要重做 UI。** 剩余差距集中在四类：

1. **可见性/可发现性**：空态没有 starter，全局搜索没有可见入口，设置有两个重复入口。
2. **手机密度**：composer 仍有 4 个控件 + “Medium” 推理强度，和 ChatGPT 的单行
   composer 有可见差距。
3. **旧主题变量仍有 77 个定义没有存在理由**：Lobe 桥 29 个零消费者，`--chatgpt-*` 11 个
   只剩 1 个 restore 消费者，`--cg-*` / `--conversation-*` / `--chat-*` 主要被冻结层读取。
4. **冻结层仍然反向拥有活代码**：canonical CSS 有 5 个变量只在 `legacy/` 或 `restore/`
   定义；`restore/` 还有 2,992 行、173 个 `!important`、38 个与 canonical owner
   完全重复的选择器。

因此本轮做两件事：先切断旧层对活代码的依赖并清掉零消费者变量，再按证据逐文件退役
`restore/`，最后做 3–4 个低风险 UX 收敛。不做大爆炸 CSS 重写，不动聊天正文、移动参考
密度、考试行为和主题调色板。

## 2. 当前证据

### 2.1 样式规模

| 指标 | 当前值 |
|---|---:|
| `frontend/src/styles` CSS 文件 | 90 |
| 规则块（脚本统计 `{`） | 3,809 |
| 不同选择器 | 3,784 |
| 跨文件重复选择器 | 251 |
| `restore/` 文件（含 index） | 9 |
| `restore/` 非 index 行数 | 2,992 |
| `restore/` `!important` | 173 |
| `restore/` 与 canonical 完全重复选择器 | 38 |
| `restore/` 内 `#appShell` 出现次数 | 377 |
| 冻结债务 baseline（`css-debt.baseline.json`） | important 256 / stackedId 27 / legacyChannel 498 |

### 2.2 主题变量族

`frontend/src/styles/themes.css` 共 923 行，除 `--ui-*` 外还发布六组历史命名空间：

| 族 | 定义数 | 零消费者定义 | 主要消费者 | 结论 |
|---|---:|---:|---|---|
| `--lobe-*` | 29 | 29 | 无 | 整组删除 |
| `--chatgpt-*` | 11 | 10 | `restore/chatgpt-parity.css` 1 处 | 改 1 处后整组删除 |
| `--cg-*` | 16 | 5 | restore 93 处；canonical 4 处 | 迁移后整组删除 |
| `--conversation-*` | 10 | 5 | restore 19 处；canonical 3 处 | 迁移后整组删除 |
| `--chat-*` | 8 | 4 | 仅 restore 4 处 | 随 restore 删除 |
| 历史 HSL 通道 `--text-*` / `--bg-*` / `--border-*` / `--accent-*` | 17 | 3 | legacy 约 448 处；TS 内联 11 处；canonical CSS 1 处 | 先清 TS/ canonical，legacy 退役前保留 |

关键反向依赖（canonical 读取冻结层的定义）：

- `polish/composer.css` 读 `--conversation-safe-bottom`，定义在 `restore/chat-surface.css:17`。
- `features/learn-scaffolds.css`、`tokens.css` 读 `--app-font-scale`，定义在
  `legacy/00-foundations.css:16`。
- `polish/mobile-shell.css` 等读 `--keyboard-inset`，定义在 `legacy/00-foundations.css:15`。
- `tokens.css` 读 `--app-width-scale`，定义在 `legacy/00-foundations.css:17`。
- `polish/workspace.css` 读 `--always-white`，定义在 `legacy/00-foundations.css:13`。

这五个变量必须先搬到 `tokens.css` 或其 canonical owner，否则删除冻结层会静默破坏活页面。

### 2.3 DOM 兼容接口

- `frontend/src/app/legacyBridge.ts:128` 的 `Object.assign(window, {...})` 发布 17 个函数。
  它们没有任何 `index.html` 内联 handler 或生产 `window.<name>` 读取，只被 Playwright /
  node:test 调用：`askChatTurn`、`addStreamingMessage`、`loadSession`、`renderRecents`、
  `setChatStopState`、`handleSendClick`、`markAuthSuccess`、`addMessage`、`askNextQuestion`、
  `saveCurrentSession`、`fetchWebContext`、`renderAssistantHTML`、`showToast`、`resetApp`、
  `startNewChat`、`startSession`、`submitChatMessage`。
- `LegacyActions`（`frontend/src/react/legacy/types.ts`）有 102 个动作键；其中 7 个在
  React 中没有任何调用：`toggleAppMode`、`toggleSidebar`、`closeSettings`、
  `getArchivedSessions`、`showGate`、`showAuthSignin`、`auth`。
- `window.SERVER_SESSIONS` / `SERVER_SESSIONS_FETCH_FAILED`
  （`frontend/src/session/serverCache.ts`）仍被 `sessionListPublisher.ts` 和 4 个 e2e
  读取；可以改成类型化 store，测试改用统一测试钩子。
- `docs/architecture/ui-structure.md` 仍写着 `window.attachments` 是稳定入口，但
  `attachments/index.ts` 只导出模块数组，没有挂到 window，文档需要同步。
- `frontend/index.html` 的 55 个 id 全部仍有引用，没有死 id；`bootLoading` 只被
  boot/theme 两个 spec 使用，但它是真实启动壳，保留。

### 2.4 `restore/` 逐文件

| 文件 | 行数 | 规则块（含 @media） | `!important` | 主要风险 / 去向 |
|---|---:|---:|---:|---|
| `fixes.css` | 199 | 19 | 18 | 不是历史文件，是当前补丁；先迁到 canonical owner |
| `chatgpt-parity.css` | 39 | 5 | 6 | 只剩 `#appShell` 字体、topicSetup、workspace fill |
| `mobile-parity.css` | 181 | 16 | 20 | 手机参考密度；迁到 `polish/mobile-*` |
| `chat-surface.css` | 478 | 57 | 44 | 定义 `--conversation-safe-bottom`；user bubble / chat-config |
| `chatgpt-v2.css` | 255 | 33 | 24 | 工作区面板几何 |
| `ref-baseline.css` | 586 | 65 | 42 | 工作区/目录页几何，最大重复来源之一 |
| `chatgpt-ui.css` | 746 | 121 | 17 | 侧栏/工作区/composer menu 历史外观 |
| `creation-surfaces.css` | 508 | 89 | 2 | Sites/Images 页面内容布局；应在 Page Kit 之后退役 |

完全重复选择器示例（restore vs canonical）：

- `.chat-config-pop` → `components/menu.css`、`polish/overlays.css`
- `.chat-config-row*` / `.chat-config-slider*` → `polish/overlays.css`
- `#appShell .recent-item-menu*` → `components/sidebar.css`
- `#appShell .library-row` → `features/surfaces.css`
- `#appShell .scheduled-task-list .task-row` → `features/surfaces.css`、`polish/app-pages.css`
- `#appShell .sidebar-*` 多条 → `polish/sidebar.css`、`polish/mobile-sidebar.css`、
  `polish/mobile-controls.css`

## 3. 对标结论

### 3.1 已达到同级、不要动的部分

| 维度 | 实测/代码 | 对照 |
|---|---|---|
| 消息列 | 768px，composer 同列同中心 | ChatGPT 768px |
| 正文 | 16/28，标题/列表节奏稳定 | ChatGPT 16/28 |
| 外壳 | 侧栏 260/52，顶栏 52，行高 36 | 同级 |
| composer | 28px 胶囊，+ / mic / send，36px 视觉 | 同级 |
| 消息操作 | 32px，复制/重试/反馈 + 更多 | 同级 |
| 命令面板 | 640px，↑↓/↵/Esc，recent 区 | 同级 |
| 主题/焦点 | `--ui-focus-shadow` 双环，扁平 scrim | 优于默认 |
| 子页面 | Page Kit 已覆盖 Projects/Library/Plugins/Scheduled/Settings/Profile/Admin | 2026-11-23 已收敛 |

### 3.2 仍然存在的 UI/UX 差距

按优先级：

**P1（建议本轮做）**

1. **设置有两个完整入口。** 侧栏底部 `#displayPrefsBtn` 的
   `DisplayPreferences`（`SidebarFooterActions.tsx:317`）包含主题、主题风格、字号、内容宽度、
   背景网格、深浅背景色；Settings → Display（`DisplaySettingsPane.tsx`）又完整包含同一组。
   ChatGPT 只有一个 Settings → Appearance。
   建议：浮层保留 Theme + Theme style + “All display settings →”，其余删除；分段控件统一
   为同一种 track + thumb 语法。
2. **全局搜索没有可见入口。** 侧栏搜索框只过滤 recents（`SidebarSearchRow.tsx`），
   Cmd-K 没有按钮或 `⌘K` 提示；命令面板没有 recent 时只显示一句空文案
   （`CommandPaletteResults.tsx:96`）。ChatGPT 的侧栏搜索行带快捷键提示，空面板直接列
   recent / quick actions。
3. **手机 composer 仍有 4 个控件。** `ComposerShell.tsx` 的 `effort.visible: opts.phone`，
   手机第二行是 `+ · Medium ⌄ · mic · send`，composer 约 86px；ChatGPT 手机默认单行，
   模型/强度收进 `+` sheet。这是独立移动密度，必须显式更新参考基线，不能顺手改桌面。

**P2（产品决定后做）**

4. **空态没有引导。** `HomeStartComponents.tsx` 明确记录 2026-11-16 移除了 shortcuts /
   starter cards；当前只有问候 + composer，900px 视口下方约 414px 空白。ChatGPT 有 4 张
   建议卡，Claude 有 starter chips。建议先做 A/B：极简 + 一行快捷键提示，或 3 个克制
   starter chips；不要直接恢复三套旧入口。
5. **Custom background 一行两个 Reset。** Settings → Display 的
   `settings-choice--color` 把 Dark/Light 两个 color input 和两个同名 Reset 放在一行；
   建议拆成两行或 2×2 小栅格。
6. **Tutor 模式没有专属空态文案。** `ComposerShell.tsx` 的 placeholder 仍是
   `chat.placeholder` / `Ask Socrates`；Tutor 只有 greeting 不同（`Let's explore.`）。
   建议补 `tutor.inputPlaceholder` 和一句模式说明。
7. **深色画布是纯黑 #000。** 这是刻意保留的 ChatGPT 手机参考（`themes.css:134`、
   `blackCanvas` baseline），不是缺陷；本轮不改，避免和 surface-ladder 守卫打架。

**已修复，不要重复做**

- 折叠侧栏 tooltip 空文本（已改 `content: attr(aria-label)`）。
- 不可见 new-reply pill 仍可聚焦（已改 `visibility: hidden`）。
- 侧栏拖拽手柄缺 separator 语义（已补 role/aria/Home/End）。
- 设置页 1027px 行宽（已收 880px）。
- 代码块 24px 按钮 / 小写语言名（已改 32px + 拼写映射）。
- Android notifications 文案（已改为通用通知权限）。
- 命令面板无 recent（已有 `RecentSection`，只差无 recent 时的 quick actions）。

## 4. 实施阶段

### Phase 0 — 基线与护栏（不改视觉）

产出：

- 本文档 + 一份可重复的页面/状态矩阵（1440/1024/390 × light/dark × 关键路由）。
- 新增 `frontend/scripts/check-css-dependencies.mjs`：
  - canonical CSS（`components/`、`features/`、`foundations/`、`layout/`、`parity/`、
    `polish/`）不得读取只在 `legacy/` 或 `restore/` 定义的 `var(--…)`；
  - 报 `file:line`，baseline 为空（固定零不变量）。
- 扩展 `check-frozen-liveness.mjs`：属性选择器（`[data-*]`）和 `var(--…)` 读取也纳入
  活体判断；动态属性允许用 `dataAttributes()` 生产者白名单。
- 给 `check-css-debt.mjs` 增加 `retiredThemeFamily` 计数：`--lobe-*`、`--chatgpt-*`、
  `--cg-*`、`--conversation-*`、`--chat-*` 的读取只能下降。

验收：新护栏在 HEAD 上通过（先允许当前 baseline），不改任何像素；`styleArchitecture`
单测更新前先记录当前 cascade。

### Phase 1 — 主题变量退役（低风险，先行）

1. **删除 Lobe 桥。** `themes.css:480-510` 的 `--lobe-*` 29 个定义全部无消费者；
   `@lobehub/icons-static-svg` 只是图标包，不读这些变量。同步删除
   `html[data-theme='socrates']` 和 philosophy 块里的 `--lobe-border-radius-*`。
2. **迁移 `--chatgpt-*`。** 唯一消费者 `restore/chatgpt-parity.css:18`
   `font-family: var(--chatgpt-font)` 改为 `var(--font-sans)`；删除 11 个定义。
3. **迁移 `--cg-*`。**
   - canonical：`foundations/shadcn.css:44` 的 `--font-sans: var(--cg-font)` 改为
     `var(--ui-font-ui)`；`polish/composer.css:16`、`polish/sidebar.css:14` 改为
     `var(--font-sans)`；`polish/mobile-sidebar.css:852` 改为 `var(--ui-bg-hover)`。
   - restore：93 处按一一对应替换为 `--ui-*`（`cg-page→ui-bg-page`、
     `cg-surface→ui-bg-surface`、`cg-surface-hover→ui-bg-hover`、
     `cg-border→ui-border-default`、`cg-border-strong→ui-border-strong`、
     `cg-text→ui-text-primary`、`cg-text-secondary→ui-text-secondary`、
     `cg-text-muted→ui-text-muted`、`cg-accent→ui-accent-strong`、
     `cg-surface-raised→ui-bg-raised`、`cg-font→font-sans`）。
   - 删除 16 个定义和 philosophy 块里的重复声明。
4. **迁移 `--conversation-*`。**
   - canonical：`components/visualization-states.css:264`、`polish/mobile-shell.css:82`
     改 `--ui-bg-page`；`parity/transcript.css:69` 改 `--ui-bg-bubble`；
     `polish/composer.css:48` 的 `--conversation-safe-bottom` 改成一个新的
     `--ui-safe-bottom`（定义在 `tokens.css`，`max(16px, env(safe-area-inset-bottom, 0px))`）。
   - restore 19 处同样替换，然后删除 10 个定义。
5. **删除 `--chat-*`。** 8 个定义只被 `restore/chat-surface.css` 读取；跟随该文件退役，
   或在 Phase 3 删除前先替换为 `--ui-*`。
6. **历史 HSL 通道。**
   - 删除 3 个零消费者定义：`--text-350`、`--border-400`、`--border-500`。
   - 迁移 11 处 TS 内联读取：
     `react/render/CodeBlockActions.tsx:60`、`react/usageModal/UsageModal.tsx:163/279/295/303/310`、
     `legacy/usageModel.ts:153`、`render/markdown.ts:370`、`render/vizStubs.ts:42-44`。
     前 8 处改用 `--ui-text-*` / `--ui-bg-*`；viz iframe 保留 fallback 并标注为独立
     iframe 调色板。
   - `foundations/shadcn.css:25` 的 `--accent-foreground` 改 `--ui-text-primary`。
   - legacy 约 448 处读取保留到 `legacy/` 退役批次；在此之前 themes.css 继续发布 HSL
     通道，但新增 `check-retired-theme` 禁止新文件读取。
7. **搬移 5 个反向依赖。** `--app-font-scale`、`--app-width-scale`、`--always-white`、
   `--keyboard-inset` 移到 `tokens.css`；`--conversation-safe-bottom` 按第 4 条改成
   `--ui-safe-bottom`。`legacy/00-foundations.css` 的默认声明删除。
8. **合并重复桥。** 当前 `--cg-*` / `--conversation-*` 在 socrates light/dark 和
   philosophy light/dark 各写一遍；删除后 `themes.css` 预计从 923 行降到约 700 行。

验收：`npm run lint` 全绿；`themes.css` 仍最后导入且只导入一次；`theme-contrast`、
`theme-system`、`chat-light-palette`、`landing-light-visual` 通过；截图无差异。

### Phase 2 — DOM 兼容接口清理

1. **删 7 个死 `LegacyActions` 键**：`toggleAppMode`、`toggleSidebar`、`closeSettings`、
   `getArchivedSessions`、`showGate`、`showAuthSignin`、`auth`。同步删除
   `legacyBridge.ts` 的 `legacyActions` 条目和 `types.ts` 的接口；`auth` 若仍有
   `getLegacyActions().auth.*` 读取，先迁到 `showGate/showAuthSignin` 的直接 import。
2. **收口 17 个测试全局。** 新增 `frontend/src/app/testBridge.ts`，只在
   `navigator.webdriver === true` 或 `location.search` 带 `__socrates_test=1` 时安装一个
   frozen `window.__SOCRATES_TEST__` 对象；把 17 个函数挂到该对象下。更新 `frontend/e2e`
   中所有 `window.<name>` 调用为 `window.__SOCRATES_TEST__.<name>`。真实用户 bundle 不再
   发布这些全局。
   - 保留 `window.__socratesLegacy` / `window.t` / native bridge，它们是生产协议。
   - 若担心 dev 下 e2e 读取时序，testBridge 在 `main.ts` 第一帧安装，早于 React mount。
3. **`SERVER_SESSIONS` 类型化。** `sessionListPublisher.ts` 改为直接读
   `sessionCache` store 快照；`serverCache.ts` 的 getter 只保留给测试钩子，并从
   `Window` 类型删除（或挪到测试 d.ts）。e2e 的 `window.SERVER_SESSIONS = [...]`
   改为 `window.__SOCRATES_TEST__.setServerSessions(...)`。
4. **清 CSS 兼容钩子。** 随 Phase 3 删除
   `#appShell#appShell#appShell`、`:not(#_n):not(._n)`、`#appShell#appShell` 这类
   specificity hack；`check-css-debt` 的 `stackedId` 从 27 收紧到 0。保留
   `#appShell` 单前缀直到 restore 全删。
5. **文档同步。** 删除 `ui-structure.md` 里 `window.attachments` 已不存在的描述；
   在 `AGENTS.md` 增加一条“测试全局只能经 `__SOCRATES_TEST__`”。

验收：相关 e2e 全绿（先跑 `storage-bootstrap`、`boot`、`react-compat`、
`chat-send`、`chat-stop-resend`、`sidebar-compat`）；生产构建里 `grep __socratesTest`
只命名单一命名空间。

### Phase 3 — `restore/` 逐文件退役

顺序按风险从低到高，每次只删一个文件，并保留可回退 PR：

1. **`fixes.css`（19 条）**
   - `.recent-item-menu` / `.sidebar-footer-actions` → `polish/mobile-sidebar.css`、
     `polish/mobile-controls.css`。
   - `.scheduled-task-list .task-row` → `features/surfaces.css`。
   - `#composerToolsMenu .composer-tools-plugin-state` → `components/menu.css`。
   - focus-visible / topic-setup 两条 → `foundations/base.css`、`polish/home.css`。
   - 删除文件，更新 `restore/index.css`、`critical-3.css`、`check-css-debt` 的
     `ORDERED_MANIFESTS`。

2. **`chatgpt-parity.css`（5 条）**
   - `#appShell` 字体 → `foundations/base.css` 或 `polish/sidebar.css`（已有
     `var(--font-sans)`，大概率直接删除）。
   - `#topicSetup` / greeting → `polish/home.css`。
   - workspace fill → `polish/workspace.css`。

3. **`mobile-parity.css`（16 条）**
   - 手机侧栏按钮、搜索、消息气泡链接/代码、scheduled 目录 → `polish/mobile-sidebar.css`、
     `polish/mobile-shell.css`、`polish/transcript.css`、`polish/mobile-directories.css`。
   - 保持 36px 搜索 / 40px tabs 的参考密度；不要套桌面值。

4. **`chat-surface.css`（57 条，44 `!important`）**
   - 先把 `--conversation-safe-bottom` 改 `--ui-safe-bottom`（Phase 1 已完成）。
   - user bubble paint → `parity/transcript.css`；chat-config popover/slider → 已由
     `polish/overlays.css` 拥有，删除重复。
   - mobile sidebar open button / mobile status → `polish/mobile-sidebar.css`。
   - 这是 `!important` 最大来源，删完 `frozen.important` 应下降约 44。

5. **`chatgpt-v2.css` + `ref-baseline.css`（33 + 65 条）**
   - workspace table/row、plugin directory head、scheduled directory、workspace page fill
     → `features/surfaces.css`、`polish/workspace.css`、`polish/app-pages.css`。
   - 先逐选择器比对 canonical 的属性：canonical 已声明同名属性且值相同的直接删；
     值不同的把差异并入 canonical owner，再删旧规则。
   - 保留 `[data-plugins-panel-open]` 等由 `legacy/layoutStateMirror.ts` 生产的属性钩子，
     但迁到 `features/surfaces.css`。

6. **`chatgpt-ui.css`（121 条）**
   - 侧栏 header/logo/recents/filter chips、workspace primary/secondary/danger 按钮、
     composer tools plugin list、auth/workspace dialog 字段。
   - 按钮外观全部并到 shadcn `Button` variants 或 `polish/buttons.css`；页面只留布局。
   - 删除后 `restore/` 只剩 `creation-surfaces.css`。

7. **`creation-surfaces.css`（89 条）**
   - Sites/Images 的 table/grid/card/editor 布局迁到 `polish/app-pages.css` 或新建
     `features/creation.css`（按 Page Kit 的页面家族 owner 规则，只保留布局）。
   - 迁移 `creation-image-card` / `creation-table` / `creation-sites-table` 等仍被
     `react/creation/CreationSurface.tsx` emit 的类。

8. **删除 `restore/index.css` 与级联入口**
   - `styles/index.css` 删除 `@import './restore/index.css'`。
   - `critical-3.css` 删除 restore 的 7 个 import；`critical-4` 起顺序不变。
   - `check-css-debt.mjs` 删除 `restore/index.css` 的 `ORDERED_MANIFESTS`，更新
     `FROZEN_DIRS` 只保留 `legacy`。
   - `styleArchitecture.test.mjs` 删除 restore 清单断言，新增“`restore/` 目录不存在”。
   - `check-surface-ownership.mjs` 删除 `rel.startsWith('restore/')` 豁免。
   - 更新 `docs/architecture/ui-structure.md`、`AGENTS.md`、本计划状态。

**退役方法（每个文件都执行）**

1. 用 dev-only 开关或临时分支单独禁用该文件，保留其余 cascade 不变。
2. 在 16 个现有状态上补 6 个缺口状态：流式工具行、思考面板、分享只读页、错误横幅、
   长列表滚动、hover/focus/pressed。
3. 每个状态 × 1440/1024/390 × light/dark 截图 + 关键节点 computed style JSON diff。
4. 无差异 → 删除；有差异 → 把差异属性迁到 canonical owner，再删；无法判断 → 保留并记录
   原因，不靠 `querySelector` 单次未匹配就删。
5. 每删一个文件后运行 `check-frozen-liveness`、`check-css-debt --update`，只允许 baseline
   下降。

验收：`frontend/src/styles/restore/` 不存在；`styles/index.css` 只剩 tokens → legacy →
canonical → parity → polish → themes；`frozen.important` 从 256 降到约 83（仅 legacy），
`stackedId` 从 27 降到 0；视觉/主题相关 spec 全绿。

### Phase 4 — UX 收敛（可与 Phase 3 并行，但独立 PR）

**P1**

1. **设置入口去重**
   - `DisplayPreferences` 只保留 Theme + Theme style + “All display settings →”
     （打开 Settings → Display）。
   - 字号/宽度/网格/背景色只保留 Settings → Display 一处。
   - 统一分段控件：复用 Chat/Tutor 的 track + thumb；删除 `display-prefs-seg` 的
     白底无槽形态。
   - 验收：`settings-modal.spec.mjs`、`sidebar-light-theme.spec.mjs`、
     `shadcn-theme.spec.mjs`；新增“浮层不包含字号/宽度”断言。

2. **全局搜索可发现性**
   - `SidebarSearchRow` 右侧加 `⌘K` kbd 提示（输入框聚焦时隐藏）。
   - 顶栏或侧栏增加一个显式全局搜索按钮（与会话内 Find 区分图标）。
   - `CommandPaletteResults` 无 recent 时给 3 个 quick actions：New chat / Settings /
     Toggle theme；固定 `min-height`，避免 204px 空盒子。
   - 验收：`cmd-k.spec.mjs`、`sidebar-nav.spec.mjs`。

**P2（需产品确认）**

3. **手机 composer 精简**
   - `effort` 移入 `composerToolsBtn` sheet，或缩成发送键左侧 28px 文本 chip。
   - 目标：默认单行，composer 高度从 86px 回到约 64px；transcript 多 22px。
   - 必须同步 `polish/mobile-*` 与 `reference-ui-visual` / `mobile-composer-*`
     基线，并在 PR 里标注 deliberate deviation。

4. **空态 starter**
   - 方案 A：保持极简，hero 28→32，composer 下加一行 11–12px 快捷键提示。
   - 方案 B：3 个克制 starter chips（不是 4 张大卡），沿用 `--ui-bg-raised` + hairline。
   - 先 A/B，不直接恢复已删除的三套入口。

5. **Tutor 空态文案**
   - 新增 `tutor.inputPlaceholder`（如“Ask a question, or try a problem”）和一句模式说明；
     Chat 保持 `Ask Socrates`。
   - 验收：`i18n` 键集一致；`chat-workbench` / `home` 视觉 spec。

6. **Custom background 行拆分**
   - Dark / Light 各一行，Reset 紧跟对应颜色；或 2×2 栅格。
   - 验收：`settings-modal.spec.mjs` 增加两行/两个 label 的断言。

## 5. 验证矩阵

按仓库规则，实现完成后再做一次合并验证，不在每个小批次反复跑全量。

| 改动 | 命令 / spec |
|---|---|
| 主题变量 | `node frontend/scripts/check-css-debt.mjs`、`check-surface-ladder`、`check-focus-ring`、`e2e/theme-contrast`、`e2e/theme-system`、`e2e/chat-light-palette`、`e2e/landing-light-visual` |
| restore 单文件 | `check-frozen-liveness`、`check-css-debt`、`e2e/library-directory`、`projects-directory`、`plugins-directory`、`scheduled-directory`、`sidebar-*`、`chat-workbench` |
| 手机恢复 | `e2e/mobile-composer-ux`、`mobile-composer-reference`、`reference-ui-visual`、`mobile-directories` |
| DOM 测试钩子 | `e2e/storage-bootstrap`、`boot`、`react-compat`、`chat-send`、`chat-stop-resend`、`sidebar-compat` |
| CSS 级联 | `npm run test:one -- test/styleArchitecture.test.mjs`、`npm run lint`、`npm run build` |
| 页面 UX | `e2e/cmd-k`、`settings-modal`、`composer-lifecycle`、`chat-workbench` |

最终验收：

- `npm run lint`（含新护栏）exit 0。
- `npm run build` 成功，bundle 不超过 `check-bundle-size` 上限。
- 删除 `restore/` 后，`git grep "restore/"` 只命中 docs/audits 历史快照。
- `themes.css` 不再包含 `--lobe-*`、`--chatgpt-*`、`--cg-*`、`--conversation-*`、`--chat-*`。
- `frontend/src` 生产代码不再出现 `window.askChatTurn` 等 17 个测试全局。
- 桌面/手机、浅/深色截图对比基线无非预期差异。

## 6. PR 拆分

| PR | 内容 | 可独立发布 |
|---|---|---|
| 1 | 新护栏 + 基线快照 + 本计划 | 是（无视觉变化） |
| 2 | Lobe / chatgpt / cg / conversation / chat 变量退役 + TS 内联迁移 | 是 |
| 3 | 5 个反向依赖搬入 tokens + canonical 读取清零 | 是 |
| 4 | LegacyActions 死键 + 17 个测试全局收口 + SERVER_SESSIONS | 是 |
| 5 | `fixes.css` + `chatgpt-parity.css` + `mobile-parity.css` | 是 |
| 6 | `chat-surface.css` + chat-config 去重 | 是 |
| 7 | `chatgpt-v2.css` + `ref-baseline.css` + `chatgpt-ui.css` | 是 |
| 8 | `creation-surfaces.css` + 删除 `restore/` + 收紧 baseline | 是 |
| 9 | 设置入口去重 + 全局搜索 + Tutor 文案 | 是 |
| 10 | 手机 composer / 空态 starter（产品确认后） | 是 |

## 7. 风险与不做的事

- **不改聊天正文和消息列**：768px、16/28、prose HTML、composer 几何保持。
- **不改主题调色板**：`themes.css` 仍是唯一 palette owner，最后导入一次；深色纯黑是
  刻意偏离，不改。
- **不重写 `legacy/`**：只迁移 canonical 依赖和 TS 内联读取；HSL 通道保留到 legacy 单独
  批次退役。
- **不按 `querySelector` 单次未匹配删规则**：必须状态矩阵 + computed style diff 双证据。
- **不动考试行为**：`data-exam-*`、评分、键盘、焦点顺序保持。
- **不把手机密度对齐桌面**：手机 36px 搜索 / 40px tabs 是参考固定值。
- **不新增第二套按钮/卡片/对话框**：所有新外观进 shadcn variants、Page Kit 或现有 owner。
- **测试只跑受影响文件**：按仓库规则，最终 diff 上一次合并验证，不跑全量。

## 8. 需要先确认的产品决定

1. 设置浮层是否保留为快速入口？建议只留 Theme + “All display settings →”。
2. 手机 composer 是否把 Effort 收进 `+` sheet？这是移动参考基线的 deliberate change。
3. 空态选 A（极简 + 快捷键提示）还是 B（3 个 starter chips）？
4. Tutor 模式是否使用专属 placeholder 和一句模式说明？
5. 全局搜索入口放侧栏搜索行（`⌘K` 提示）还是顶栏按钮？建议两者都做，但先做提示。

## 9. 执行记录（2026-11-26）

本轮已落地 Phase 0–3 和 Phase 4 的低风险项：

| 项 | 结果 |
|---|---|
| 主题变量 | 删除 `--lobe-*`（29）、`--chatgpt-*`（11）、`--cg-*`（16）、`--conversation-*`（10）、`--chat-*`（8）五组桥；`themes.css` 从 923 行降到 733 行 |
| 冻结区依赖 | `--app-font-scale`、`--app-width-scale`、`--keyboard-inset`、`--always-white`、`--always-black` 移到 `tokens.css`；`--conversation-safe-bottom` 改为已有的 `--ui-safe-bottom` |
| 历史 HSL | 删除 `--text-350`、`--border-400`、`--border-500`；TS 内联读取全部改 `--ui-*` 或 iframe fallback；canonical CSS 读取归零 |
| DOM 兼容 | `app/legacyBridge.ts` 的 17 个浏览器 hook 只在 Playwright 注入 `__installSocratesTestState` 时安装；生产 fallback 改为直接 import；`sessionListPublisher` 不再读 `window.SERVER_SESSIONS_FETCH_FAILED` |
| `restore/` | 9 个文件、2,992 行全部删除；`creation-surfaces.css` 迁到 `features/creation.css`；`restore/index.css`、`critical-3.css`、`check-css-debt` 清单同步移除 |
| CSS 债务 | frozen important 256→43、hex 28→3、literal radius 119→87、stacked id 27→0、literal font 210→156、legacy channel 498→435；live stacked id 24→23 |
| 设置入口 | 侧栏浮层只保留 Theme / Theme style / “All display settings”；字号、宽度、网格、背景色只在 Settings → Display |
| 全局搜索 | 侧栏搜索行增加 `⌘K` 按钮；命令面板无 recent 时给 New chat / Settings / Toggle theme 三个快捷动作 |
| Tutor 文案 | 新增 `tutor.inputPlaceholder` / `tutor.chatPlaceholder`，按 appMode 切换 |
| 背景色 | Settings → Display 拆成 Dark background / Light background 两行，Reset 跟随各自颜色 |
| 手机 composer | 保持参考的双行 86px host + 52px 静止 frame；非默认推理强度在静止态显示，默认 medium 仍折叠 |
| 空态 | 继续遵守 2026-11-16 的“问候 + composer”极简决定，不恢复 starter cards；如果产品要 starter，按本文 P2 方案 B 单独开 PR |
| LegacyActions | 7 个键（`toggleSidebar` / `toggleAppMode` / `closeSettings` / `getArchivedSessions` / `showGate` / `showAuthSignin` / `auth`）已从生产 bridge 删除；e2e 改走 `window.__socratesTestState.actions`（同样只在测试接收器存在时安装） |
| 属性 liveness | 新增 `check-attribute-liveness.mjs`：所有样式（含 `legacy/`）的每个 `[data-*]` 选择器必须由 TS/TSX/JS/HTML 的 `data-*`、`dataset.fooBar`、`dataAttributes({ fooBar })` 或 `setAttribute` 生产；Radix/shadcn 属性白名单 |

验证：

- `npm run lint` exit 0（含新增 `check-css-dependencies`、`check-attribute-liveness`）。
- `npm run build` 成功。
- 已跑：`npm run test:fast` 160/160；`styleArchitecture` 13/13；`chat-workbench`、`composer-parity`、`library-directory`、`projects-directory`、`plugin-directory`、`sidebar-rail`、`sidebar-compat`、`home-customization`、`display-prefs-direct-handlers`、`theme-system`、`theme-contrast`、`mobile-home-visual`、`mobile-composer-reference`、`mobile-composer-ux`、`mobile-directory-ux`、`reference-ui-visual`、`composer-lifecycle`、`web-search-context`、`session-pending-turn-restore`、`diag-realbooted` 等受影响 spec 全绿；合并的 77 项 e2e 一次通过；LegacyActions 迁移后 60/60、28/28、24/24 三批相关 spec 通过。

尚未做（需要产品确认或后续独立批次，不阻塞本轮清理）：

1. 手机 composer 把推理强度收进 `+` sheet（当前保留参考双行）。
2. 空态 starter chips（当前保留极简）。
3. 深色画布提亮（纯黑 `#000` 是刻意保留的 `blackCanvas` 偏离）。


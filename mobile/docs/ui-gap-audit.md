# Mobile ↔ Frontend UI Gap Audit

> 1:1 视觉/交互对齐审计，2026-09-03 生成。§1/§2/§4/§5 由并行 subagent 审计后由主 agent 压缩落盘；
> §3 因 modal subagent 触及 Token Plan 上限失败，由主 agent 直写（值均取自 `styles.css` + 各 `*.tsx` 实测）。
> 父文档（status / 范围）见 [`frontend-parity.md`](./frontend-parity.md)。

> - ✅ = 已对齐
> - 🟡 = 局部对齐，存在具体差异
> - 🔴 = 当前无对应实现
> - 严重度：**P0（必改，破坏 1:1）/ P1（应改，可见差异）/ P2（细节，可后续）**

> **P0 TOP 清单（先修这些即回到 1:1 主干）**：
> Screen：Chat bubble radius（§1.2）、Mistakes 卡视觉（§1.11）、Workspace 同名异物（§1.13）、Share/More route-vs-modal（§1.15/1.17）；
> 组件：Composer focus/maxWidth/attach（§2）、MessageBubble radius/字号（§2）、ToolCard radius 体系（§2）、附件条缺失（§2）；
> Modal：Usage 480→720 + heatmap、Share/More/PromptTemplates/Settings 转 modal（§3）；
> Token：easing 未接入、frontend `tokens.ts/themes.css` 与渲染分裂（§4.1/4.2/4.7）；
> 交互：focus ring / disabled / skeleton+toast / composer 过渡 / pill / sidebar slide / 推理环（§5 TL;DR）。

---

## §1 Screen Audit（18 个 Screen）

> Source: subagent `ses_f9959fe31ffe8LTU2E4uW7qdg0` 全量审计。每个 Screen 的 frontend 对照见
> [`frontend-parity.md`](./frontend-parity.md) Screen parity 表。本节只记**当前具体差异**。

### 1. NewChatScreen — 🟡 P1
**Mobile**: `mobile/src/screens/NewChatScreen.tsx` (375 行) / **Frontend**: `src/ui/greeting.js` + `src/ui/homeIdeas.js` + `src/ui/suggestions.js:37-136` + `index.html:561-637`
- Greeting 字体：mobile `typography.display` (Newsreader) 32px/41 (`NewChatScreen.tsx:175,317-322`)；frontend `.topic-title.greeting` clamp `2rem–2.75rem` (32–44px)，line-height 1.15，默认 `.topic-title` 用 sans (`styles.css:5188,11005`)。
- Greeting 容器：mobile 无 max-width；frontend `max-width:36rem` (`styles.css:11013`)。
- 顶部留白：mobile `minHeight:120 + flex:1` + scroll `paddingTop:4` (`:310-313,296`)；frontend `.main-inner { padding:4dvh 12px 24px }` 随屏高生长 (`styles.css:2984`)。
- Idea 行：mobile `gap:14` + 24×24 `surfaceRaised` 圆盘 + 无背景 (`:337-347`)；frontend `.home-idea { gap:8px; border:0.5px solid hsl(0 0% 100%/.08); radius:999px }`，icon 容器 24×24 透明 (`styles.css:11184-11218`)。
- 图标：mobile Ionicons；frontend `ICON_CACHE` SVG (`suggestions.js:347-378`)，几何不一致。
- 缺失：AI starters（frontend `fetchAiStarters` 落地后淡入 2 条，`suggestions.js:171-236,580-604`；mobile 只有确定性 library 对，`:60-65,118`）；topic disclaimer overlay (`.disclaimer` `styles.css:2204`)；"Ideas for you" 在 frontend 默认 `display:none` (`styles.css:11177`)，mobile 常显大写 12px tracking-0.8 (`:183-185,328-334`)。
- 交互：mobile 点 idea 只 `appStore.setDraft` (`:112-115`)；frontend `setComposerMarkdown + focusComposer` (`homeIdeas.js:8-12`)。问候语 mobile 本地 `getHours()` (`:130-135`)；frontend 先解 visitor tz (`greeting.js:26-58`)。

### 2. ChatScreen — 🟡 P0（bubble radius / cite / 工具栏）
**Mobile**: `mobile/src/screens/ChatScreen.tsx` (544 行) / **Frontend**: `index.html:717-820` + `src/render/markdown.ts` + `src/ui/toolCards.js`
- 消息列表：mobile `paddingHorizontal:spacing.sm + paddingTop:12` (`ChatScreen.tsx:285`)；frontend `#msgList { padding-top:12px; padding-bottom:0 }` 无水平 padding (`styles.css:1608`)。
- User bubble：mobile `radius:20, padding 9/18, maxWidth 90%, 无边框` (`MessageBubble.tsx:115-122`)；frontend `radius:24, padding 9/18, maxWidth 90%` (`styles.css:1881`)。**Radius 20 vs 24**。
- Assistant bubble：mobile `paddingHorizontal:2, paddingVertical:4`；frontend 无 padding (`styles.css:1889`)。
- 字号：mobile `15/24` (`MessageBubble.tsx:253`)；frontend `15px × fontScale(1.125) ≈ 16.9, lh 1.625` (`styles.css:2029`)——mobile 忽略 fontScale。
- Toolbar：尺寸一致（28×28 gap 2，`MessageBubble.tsx:307-328` vs `styles.css:1896-1904`）；但 mobile 常显，frontend `opacity:0 → :hover opacity:1` (`styles.css:1896-1899`)。
- ToolCard：mobile `padding:10, borderWidth:1, radius:4` (`ToolCard.tsx:391`)；frontend `.agent-tool-card { padding:0; border:0 }` (`styles.css:3471`)。mobile 只有折叠 toggle；frontend 有 source/reload/expand/fullscreen (`styles.css:508,527`)。
- 缺失：`{cite}` 上标（🔴）；user 消息 inline 编辑；link previews (`linkPreviews.js`)；ToolRun approve/decline；reasoning 块 mobile 是 2px 左 border 卡，frontend 是 `.tool-inline` 风格。
- 交互：mobile 会话内搜索是 header 下 inline 行 (`ChatScreen.tsx:223-261`)；frontend `.find-bar { position:absolute; top:10px; right:14px }` (`styles.css:1996-1997`)。

### 3. TutorScreen — 🟡 P1（形态不同）
**Mobile**: `mobile/src/screens/TutorScreen.tsx` (88 行整屏) / **Frontend**: `src/tutorSocratic.js` + `.tutor-explore-overlay` modal
- 形态：mobile 是整屏 stage 列表 + 知识卡 + Begin diagnosis 按钮；frontend tutor 住在 chat composer 里，唯一独立 chrome 是 modal `.tutor-explore-overlay { width:min(480px,100%); padding:28px; radius:22px }` (`styles.css:4259`)。
- 标题：mobile 30px sans 700 (`TutorScreen.tsx:88`)；frontend `h2 { font-family:serif; 25px; 600 }` (`styles.css:4261`)。
- 知识卡：mobile `padding:spacing.lg` 三格计数；frontend `renderKnowledgeBoundaryFile` 三段列表 + force-directed SVG (`tutorSocratic.js:346-472,300-344`)——mobile 无 graph（🔴确认）。
- 缺失：save-snapshot、teaching plan 侧栏 + 进度条 (`renderTeachingPlan :514-564`)、practice progress chip (`:574-606`)、"讲解一下/再想想" explain dialog (`:178-188`)、mistake filter bar tutor 侧集成。
- 交互：mobile 点 Begin → `startNewSession('tutor')` 进 Chat (`TutorScreen.tsx:28`)；frontend 先弹 explore overlay 再 POST `/api/tutor/start`。

### 4. RecentsScreen — 🟡 P1
**Mobile**: `mobile/src/screens/RecentsScreen.tsx` (275 行) / **Frontend**: `src/ui/sidebar.js` + `SessionList.tsx` + `RecentsFilterChips.tsx`
- Tabs：mobile 3 个（chats/uploads/created）+ hairline + 2px 指示条 (`:127-144,244`)；frontend Library 2 个（files/artifacts）pill 背景切换 (`index.html:660-663`, `styles.css:558-561`)。
- 行：mobile 38×38 圆盘 + `minHeight:76` + 标题 15 semibold + 预览 12 (`:247-251`)；frontend icon 14×14 SVG + `padding:8px 12px`（约 38px 高）+ 12px/10px (`styles.css:281,459,472-474`)。
- 缺失：filter chips（🔴）；time-group header（Today/Yesterday，`styles.css:257-258`）；pin/label/tag（web `.recent-item-pin-icon/label/tag-btn`，mobile 只有一个 pin `:173`）；context menu（mobile 用 `Alert.alert` `:99-108`，web 下拉 panel）；inline 600ms confirm bar；bulk selection；library search input；图片预览（mobile 只有文本 Modal `:188-206`）。

### 5. ProjectsScreen — 🟡 P1
**Mobile**: `mobile/src/screens/ProjectsScreen.tsx` (150 行) / **Frontend**: `index.html:670-679` `#spacesPanel` + `styles.css:591-605`
- Header：mobile `<AppHeader title>` 16 semibold；frontend `.spaces-title` 大写 12px 600 tracking .04em (`styles.css:595`) + 右侧 inline New 按钮（mobile 用 56×56 FAB `right:20 bottom:24`，`:114`）。
- 行：mobile `minHeight:84 + hairline + gap:10`；frontend `gap:8, padding:8px 10px, radius:7px` (`styles.css:599`)。
- 色块：mobile 12×12 方块 (`:92`)；frontend 10×10 圆 (`styles.css:601`)。
- Editor：mobile `Modal slide` 88% 高 (`:115-131`)；frontend `.workspace-dialog` 居中卡 `min(440px,100%)` + backdrop blur (`styles.css:588`)。
- 缺失：行内 count badge、header New pill、color picker UI（mobile 只存 `color` 不绑 UI）。

### 6. ScheduledScreen — 🟡 P1
**Mobile**: `mobile/src/screens/ScheduledScreen.tsx` (175 行) / **Frontend**: `index.html:680-689` + `styles.css:607-625`
- Header 同 Projects（mobile 16 semibold vs frontend 大写 12px，`:611`）；mobile 无 intro 行（web `.workspace-intro 11px text-500`）。
- 行：mobile `minHeight:86 gap:10`；frontend `gap:8 padding:8px 10px radius:7px`（约 38px，`:615`）。
- 状态：mobile 34×34 圆盘 + ✓ + `Run now / Pause|Resume` 文字按钮 (`:119,125-126`)；frontend 6px 圆点 (`styles.css:621-624`)，无行内 pause/resume。
- Editor：mobile `Modal slide` + once/daily/weekly/monthly 四按钮 + `YYYY-MM-DDTHH:mm` 裸输入 (`:140-141`)；frontend 无对应 editor。
- 缺失：状态色点（active 绿 / paused Amber / completed 灰）；header New 按钮（mobile 用 FAB）。

### 7. PluginsScreen — 🟡 P2（Screen 报告未展开，parity 🟡）
对照 `src/extensions/` + `src/react/extensions/`。mobile editor 用 `Modal slide` (`PluginsScreen.tsx:90`)；frontend extensions 走 `WorkflowLayer/ExploreStepper`。缺失 workflow disclosure 细节，待补采。

### 8. ExamScreen — 🟡 P1
**Mobile**: `mobile/src/screens/ExamScreen.tsx` (365 行 4 modes) / **Frontend**: `src/exam.js` + `styles.css:2369-2577`
- 表单卡：mobile `padding:spacing.lg(16) radius:16` (`:287`)；frontend `padding:18px 16px radius:16px` (`styles.css:2370-2377`)。mobile 无 max-width（`paddingHorizontal:20` 撑满，`:361`）；frontend `max-width:720px margin auto` (`:2369`)。
- Hero：mobile kicker 11px tracking 1.5 + 32/39 + 15/23 (`:361`)；frontend `h3 { serif; clamp(25px,4vw,36px); 600; -.035em }` (`:2396`)。
- 选项字母：mobile 18×18 无 radius (`:364`)；frontend 18×18 `radius:3px` 11px 500 (`:2556`)。
- 分数：mobile 42px 800 (`:364`)；frontend 约 48px 700。
- 缺失：`.exam-form-grid3` 三列桌面布局 (`:2388`)；`.exam-form-toggle-card` 大图标卡 (`:2426-2460`)；`.exam-form-eyebrow`；`.exam-q-explanation` 样式块（mobile 只追加纯文本）。

### 9. SearchScreen — 🟡 P1（功能面不同）
**Mobile**: `mobile/src/screens/SearchScreen.tsx` (81 行全局搜索 `/api/search/query`) / **Frontend**: `.find-bar` 会话内 find-on-page (`findInSession.js` + `FindInSession.tsx` + `styles.css:1996-2004`)
- mobile 搜索条 `minHeight:56 radius:12` + 40×40 go 按钮 (`:51-54`)；frontend `absolute top:10 right:14 padding:6/8 radius:10 gap:6`。
- mobile 结果是 `paddingVertical:15 hairline` 行 + chevron (`:62-68`)；frontend 是 `.msg-body` 内 `<mark>` 高亮，无结果列表。
- mobile 用 `colors.action` (`:53`)——parity open question 2 已标记该 token 待废弃。
- 缺失（双向）：mobile 无 in-conversation `<mark>` 高亮（`MessageBubble` 只有 plain 文本高亮 `HighlightedPlainText :22-43`）；frontend 无跨会话 `/api/search/query` 面。

### 10. KnowledgeScreen — 🟡 P1
**Mobile**: `mobile/src/screens/KnowledgeScreen.tsx` (46 行) / **Frontend**: `renderKnowledgeBoundaryFile` (`tutorSocratic.js:346-472`) + `knowledgeView.js` + `knowledgeDetail.js`
- mobile 行 `minHeight:68 hairline gap:10` + 9×9 状态点 (`:46-47`)；frontend `.kb-node { gap:10 padding:7/12 radius:8 12px }` 圆角行 (`styles.css:228`)，列表视图无圆点。
- mobile 按 `nodeName` 去重 + status 排序 (`:27-35`)；frontend 三 section（internalized/fuzzy/blank）全量列出 (`:400-444`)。
- 缺失（🔴确认）：force-directed SVG graph (`:300-344`)；detail panel (`.kb-node-detail :3258`)；[系统]/[我] 标注行 (`:423-431`)；snapshot 历史 + save 按钮。

### 11. MistakesScreen — 🟡 P0（视觉模型不同）
**Mobile**: `mobile/src/screens/MistakesScreen.tsx` (161 行) / **Frontend**: `src/ui/mistakeBook.js` + `styles.css:3296-3311,4223-4321`
- 卡：mobile 中性行 `gap:12 paddingVertical:17 hairline` + 34×34 圆盘 (`:147-148`)；frontend 危险 tint 卡 `margin:0 4px 8px padding:10/12 radius:10 bg:hsl(0 60% 12%/.35) border-left:3px hsl(0 60% 55%)` (`:3296`)。**背景/边框完全不同**。
- 题干：mobile 15/21 semibold (`:150`)；frontend 12px text-100 lh 1.5 (`:3301`)。
- 选项：mobile 只 render `userAnswer/correctAnswer` 两行文本 (`:152-153`)；frontend 四选项 A/B/C/D + `correct-tag/wrong-tag` (`:3303-3308`)。
- 缺失：三态 filter（mobile 只有 unresolved/resolved `:17`，web all/unresolved/resolved）；Redo 按钮 + redo count (`.mistake-redo-btn` → quiz widget `mistakeBook.js:146-200`)；sidebar badge (`#mistakesTabBadge :88-93`)；resolved pill（mobile 只翻 checkmark `:107`）。

### 12. SettingsScreen — 🟡 P1（route vs modal）
**Mobile**: `mobile/src/screens/SettingsScreen.tsx` (524 行整屏路由) / **Frontend**: `#settingsOverlay` modal (`.settings-modal { 90%; max-width:440px; max-height:85vh; radius:16px }` `:2210`)
- mobile `paddingHorizontal:18` 撑满 (`:264`)；frontend body `padding:16/20/20 gap:16` (`:2216`)。
- Section label：mobile 11px tracking 1.4 700 (`:266`)；frontend 12px 500 大写 tracking .04em (`:2218`)。
- 输入：mobile 46px 14px 默认字体 (`:276`)；frontend `padding:10/14 radius:10 14px monospace` (`:2219`)——**web monospace，mobile 非**。
- Switch：mobile RN `Switch` (`:204-210`)；frontend `.toggle-track`。
- 缺失：provider 列表 + masked key (`settings.js:9-200`)；profile modal（avatar/name/email/sign-out/danger）；external API toggle；cookie consent。

### 13. WorkspaceScreen — 🔴 P0（同名异物）
**Mobile**: `mobile/src/screens/WorkspaceScreen.tsx` (65 行卡片导航：Projects/Scheduled/Plugins/Library/Knowledge/Mistakes) / **Frontend**: Tiptap canvas（`CanvasBlock.tsx` + `CanvasToolbar.tsx`）
- mobile 卡 `minHeight:76 padding:13 gap:12 radius:12` (`:62`) + kicker 11/1.5 + heading 31/38 + body 14/22 (`:58-60`)；frontend canvas 无此 chrome，只有一个浮动 toolbar。
- 缺失：整个 Tiptap editor surface、toolbar（bold/italic/headings/code/quote/list/divider/undo/redo）、document model + autosave、canvas i18n。

### 14. EmbeddedWebScreen — ✅
**Mobile**: `mobile/src/screens/EmbeddedWebScreen.tsx` (138 行) / **Frontend**: skills/apiSettings iframe。parity ✅。
- mobile 多 58px header + hairline + 44×44 back/reload (`:130-131`)；web iframe 无 header chrome。
- `react-native-webview` (`thirdPartyCookiesEnabled:false`, `allowsBackForwardNavigationGestures` `:107-112`) vs `<iframe>`；bridge `close/authExpired/openExternal/download/navigate` (`:68-79`) 已对齐。
- Android back → `goBack()` (`:41-47`)；外链走 `native.openBrowser` (`:55-57`)。

### 15. ShareScreen — 🔴 P0（route vs modal，见 §3.4）
**Mobile**: `mobile/src/screens/ShareScreen.tsx` (32 行整屏) / **Frontend**: `.share-modal { 90%; max-width:400px; padding:24/20/20; radius:16px }` (`styles.css:2603-2605`)
- web 三 visibility radio 卡 + copy + revoke + status/error (`:2610-2631`)；mobile 全无，只有 `native.share(url)` + Done。
- 修复路径：按 parity 建议转为 modal（`frontend-parity.md:30`）。

### 16. ArtifactPreviewScreen — 🟡 P1
**Mobile**: `mobile/src/screens/ArtifactPreviewScreen.tsx` (87 行整屏) / **Frontend**: `.artifact-preview-drawer` 右抽屉 (`styles.css:7606-7679`)
- 标题：mobile 18px 700 (`:83`)；frontend 14px 560 + pill close (`:7646-7650`)。
- 动作：mobile reload + copySource (`:53-72`，fullscreen/PNG no-op)；frontend source/reload/expand/fullscreen (`:508`)。
- 缺失：fullscreen、expand overlay、MIME 类型头图标、source code panel、drawer slide 动画。

### 17. MoreScreen — 🔴 P0（route vs popover，见 §3.8）
**Mobile**: `mobile/src/screens/MoreScreen.tsx` (58 行整屏：avatar 40 + 5 行 + logout) / **Frontend**: `MorePopover.tsx` 定位 popover（7 项：Plugins/Exam/Skills/Settings/Display/Shortcuts/Signout）
- mobile 行 `minHeight:72 hairline` + 15px 700 标题 (`:57`)；frontend 36px 按钮。
- mobile 5 项（Settings/Workspace/Search/Knowledge/Mistakes `:15-21`）；frontend 7 项——**集合不同**，Plugins/Exam/Skills/Shortcuts/DisplayPrefs 在 mobile More 缺席。

### 18. AuthScreen — 🟡 P2（最接近）
**Mobile**: `mobile/src/screens/AuthScreen.tsx` (366 行) / **Frontend**: `.auth-gate/.auth-card` (`styles.css:2989-3014`)
- 卡：`padding:32/28`、maxWidth 420、radius 18——三方全对 (`AuthScreen.tsx:282,267` vs `:3014`) ✅。
- 网格背景：mobile SVG 32px (`:321-366`)；frontend 双 linear-gradient 32px (`:2989`) ✅。
- 差异：mobile tab 52px + 下划线 (`:285-288`)；label 11px tracking .55 大写 (`:291`) vs web `.auth-label tracking .05em`；state icon 64×64 (`:309`)；≤768px web 收紧 `padding:24/16` (`:4342-4343`) mobile 无；OAuth mobile 仅 GitHub (`:189-199`)。

**跨屏共性**：spacing 用 theme vs web 直接 rem/px；radius mobile `xs/sm/md/lg/pill/xl` vs web 7/8/10/12/16/22 ad-hoc；typography mobile `body/medium/semibold/bold/display/mono` vs web `var(--font-*)` + 数字字号；hairline mobile `hairlineWidth` vs web `0.5px solid`；`colors.action` 残留（`SearchScreen.tsx:53`）；AppDrawer 625 行 vs `SidebarNav.tsx` 144 行（mobile 把 session list + rename + profile/usage/storage 全塞进 drawer，web 拆分为独立 React 组件）。

## §2 Component Audit

> Source: subagent `ses_f9959fd9cffeMlPekx2P6u1DcF`。Token 基线：mobile `theme.ts` vs `frontend/src/styles.css` + `tokens.css`。
> `fontScale:1.125` (`theme.ts:340`) 在以下所有组件里**零引用**——每个字号都应走 `scaleFont(theme, base)` (`theme.ts:310`)。

### AnimatedPressable — 🟡 P1
`mobile/src/components/AnimatedPressable.tsx` (26 行)。`scale=0.975` (`:12`) + `Animated.spring(damping:18,stiffness:260,mass:0.7)` (`:14`)。
- frontend 按面取 `.88–.985`（`.icon-btn:active .92` `:203`、`.msg-toolbar-btn:active .88` `:1904`、`.composer-tools-item:active .985` `:811`、`.send-btn.active:active .92` `:2147`），缓动 `cubic-bezier(.16,1,.3,1)` / `(.4,0,.2,1)`。单值 0.975 无法表达该 ladder；spring vs tween 模型不同。
- 无 hover（RN 无 `:hover`；web `.recent-item-actions` hover reveal `:285`、`.icon-btn` hover 提亮 `:202`）；无 focus ring（web `button:focus-visible outline 2px accent/.85 offset 2px` `:121`）；disabled 无视觉（web `.settings-btn.primary:disabled opacity .6 cursor not-allowed` `:2237`）。
- 修复：加 `scale?: number` + `disabledOpacity`，disabled 时跳过 spring。

### BrandMark — ✅/🟡 P2
`mobile/src/components/BrandMark.tsx` (16 行)，asset 与 web 同源（`icon_1024.png`）。
- 尺寸 mobile 默认 28 (`:6`)；web 16–24（sidebar 上下文）。mobile brand 行 64px (`AppDrawer.tsx:521`) vs web header `padding:8/8/8/12`（约 40px）。
- 形状 mobile `borderRadius:size/2` 全圆 (`:8`)；web `radius:3px` (`:5224`)。

### Composer — 🟡 P0（残留 4 处）
`mobile/src/components/Composer.tsx` (433 行) vs `RichComposer.tsx` + `.chat-input-wrap/.topic-input-wrap` (`:1079,2078`)。
- 对齐 ✅：胶囊 `radius:28` (`:145` vs `:2078`)；`padding:7/8` (`:340-341` vs `:4781`)；背景 `surfaceRaised` (= bg.overlay)；边框 `withAlpha(border,0.24)` vs web `border-300/.24` (`:2078`)。
- Focus 边框 **MISMATCH**：mobile `accent @ .45` (`:141`)；frontend `:focus-within accent @ .6` (`:4783`)，且 web 有 `.34s cubic-bezier(.22,1,.36,1)` glide，mobile 瞬切。
- ~~`maxWidth:620` 硬编码 (`:336,351`) 与 `contentWidth:928` (`theme.ts:340` = `58rem` `:1050`) 冲突——1024px 平板上 620 胜出，composer 比 web 窄。~~ **2026-09-18 已修**：`BASE_CONTENT_WIDTH` 改 768（`--conversation-content-width`），Composer 内联 `maxWidth: contentWidth`，620 仅作 fallback。
- 字号 bypass fontScale：`14/20` (`:374-375`) vs web `14 × 1.125 = 15.75, lh 1.5` (`:2103`)；展开行 (`:390-391`) 同。
- Attach 按钮 mobile 38×38 (`:410-416`) vs web 28×28 (`:2111`)。注释称 frontend 38 是错的，以 `styles.css:2111` 为准。
- 死代码：`micBtn` + `VoiceWaveBars` (`:30-54,418-424`) 注释说已删但样式保留；`shadowColor:'#000'` 应走 `colors.black`。
- 发送字形 16px ✅ (`:214` vs `:2148`)。

### AppDrawer — 🟡 P1
`mobile/src/components/AppDrawer.tsx` (625 行) vs `Sidebar.tsx` + `styles.css:176-720`。
- 宽 ✅：`maxWidth:288` (`:518`) = `18rem` (`:176`)。背景 alpha .72 一致，但 mobile 硬编码 `rgba(13,13,13,.72)/rgba(252,251,248,.72)` (`:511-512`) 而非 palette 解析。Blur mobile `intensity:18` (`:289`) vs web `blur(12px)` (`:176`)。
- Brand 行 mobile `64px + paddingHorizontal:16` (`:521-527`) vs web `padding:8/8/8/12`；brand 字 20 (`:528`) vs web `17 × scale ≈ 17.6` (`:198`)。
- 搜索条结构 ✅（32px 高 radius 8，`:530-545` vs `:213-217`）；字号 mobile 13 vs web ≈12.4（差 fontScale）。
- Nav 按钮 mobile `minHeight:42 paddingHorizontal:12 14px` (`:550-556`) vs web `padding:7/10 ≈ 14px` (`:5166`)——mobile 更高更宽。
- Footer mobile `minHeight:70 paddingHorizontal:14` (`:599-606`) vs web `padding:6/8` (`:652`)；footer 图标 mobile 36×36 (`:616`) vs web 28 (`:201`)。
- 结构：mobile footer 放 theme toggle（web 无；web 经 `displayPrefs.js`）；长按 `Alert.alert` (`:200-234,354`) vs web inline `.sidebar-more-popover` (`:697`)；rename dialog 与 RecentsScreen 重复 (`:617` 注释)；无 resize handle（web `.sidebar-resize-handle 10px` `:187-195`）。

### AppHeader — 🟡 P1
`mobile/src/components/AppHeader.tsx` (361 行) vs `index.html:475-555` + `styles.css:963-965,1086-1110,1689-1836`。
- 容器 ✅：`paddingHorizontal:14 paddingBottom:8 minHeight:44 gap:12` (`:244-253` vs `:963`)。
- 圆形按钮 mobile 32×32 radius 8 (`:260-267`) vs web 28×28 radius 6 (`:201`)。
- Mode pill mobile `172×40 radius:20 padding:3` (`:268-276`) vs web 自适应 pill `radius:999 gap:2` (`:1689-1701`)。
- Active 背景 mobile `surfaceHover` (`:284-291`) vs web `bg-100 + shadow` (`:1719-1722`)。字 mobile 14.5/700 (`:292-294`) vs web `13 × 1.125 ≈ 14.6 / 600` (`:1702-1711`)。
- Model chip 体 ✅（`5/10 radius:6 13px` `:307-322` vs `:1104`）；caret mobile 12 vs web 9 (`:1217`)。
- 结构：web 左 `[sidebar toggle…]` + 中 absolute tabs + 右 `[model,find,share,more]`；mobile `[hamburger] + [segmented|title+chip] + [pill|chip+chat]`。web `chat-stats/exam-title-bar` mobile 无。
- 交互：web caret 开合旋转 180° (`:1217-1218`)、`.top-mode-toggle:active scale(.97)` (`:1718`)，mobile 均无。

### Screen — 🟡 P2
`mobile/src/components/Screen.tsx` (15 行) vs `.app/.main/.main-inner` (`:954-1050`)。
- mobile `SafeAreaView` + 无条件 `padding:20` (`:12,15`)；frontend `.main-inner { padding:0 16px }` (`:1047`) + `padding-bottom:max(16px, safe-area)` (`:2072`)。**20 vs 0/16**。
- 键盘：mobile `KeyboardAvoidingView` (`:11`)；frontend `body.keyboard-open` + padding。导航范式不同（RN 单路由 vs web 兄弟 view 显隐 `:1031-1067`）。
- 修复：`padding:20` → `spacing.lg + spacing.xs` 对齐 16px。

### MessageBubble — 🟡 P0
`mobile/src/components/MessageBubble.tsx` (329 行) vs `MessageItem/Toolbar.tsx` + `styles.css:1873-2034`。
- User bubble radius **20 vs 24** (`:115-122` vs `:1881`)；assistant mobile 多 `paddingHorizontal:2/Vertical:4`，web 无 (`:1889`)。
- 字 `15/24` (`:253`) vs web `15 × 1.125 ≈ 16.9, lh 1.625` (`:2029`)。
- Reasoning 卡 mobile `borderWidth:1 padding:12/8 radius:8` (`:127,254-265`) + 2px accent 左条 + 12/18 (`:282-283`)；frontend 是无边框 quiet status 行 + `11 × scale` (`:4759-4760`)。
- 附件 chip mobile `radius:8 padding:10/6 maxWidth:240` (`:285-295`) vs web `radius:14 padding:3/10/3/3 11px maxWidth:200` (`:1885`)；图片 mobile 固定 248×170 (`:303`) vs web 流式 `max-width:100% max-height:280 radius:10` (`:2888`)。
- Toolbar 尺寸 ✅（28×28 gap 2 `:307-328` vs `:1896-1904`）；但 web hover reveal + tooltip (`::after attr(aria-label)` `:1908-1909`)，mobile 常显无 tooltip；动作 mobile 是 web 子集（缺 share/regenerate/branch/re-explain `MessageToolbar.tsx:65-100`）。
- Active 色 mobile `accent` (`:217,224,231`) vs web gray `bg-300` (`:1912`)；speaking mobile 只变色，web `readAloudPulse 1.4s` (`:1915-1917`)。

### ToolCard — 🟡 P0（radius 体系错位）
`mobile/src/components/ToolCard.tsx` (423 行) vs `toolCards.js` + `toolCardView.ts` + `styles.css:3844-3899`。
- 容器 mobile `borderWidth:1 padding:10 radius:4` (`:365,391`)；frontend `.agent-tool-card { transparent; border:0 }` (`:3845-3847`)，radius 只在 open group 用 `--tool-card-radius:14px` (`:62`)。**mobile 4px vs web 14px**。
- Header mobile 无 min-height + 7px 点 (`:366,392-395`)；frontend `min-height:30 padding:4/2 gap:7` + 16px 状态图标 (`:3849-3855`)。
- 名字 mobile mono 12/700 (`:368`) vs web sans `13 × scale ≈ 14.6 / 500` (`:3872`)。输出体 mobile `8/7 11/16 radius:4` (`:377,399-400`) vs web `9/11 max-height:320 radius:11` (`:3889-3893`)。
- Kicker mobile 10px tracking .7 700 accent 大写 (`:248,410`) vs web 500 `10 × scale` tracking .06em subtle gray (`:3883-3887`)。
- 状态机：mobile 本地 `expanded` (`:341`)；frontend `data-state` + `.open` CSS (`:4755-4762`)。Running mobile `ActivityIndicator` (`:369`) vs web `search-progress-dot 1.1s` (`:4755`)。
- `PREVIEW_LINES=6` (`:15`) vs web `.tool-run-group:not(.open)` 折叠——机制不同。

### ArtifactWebView — ✅
`mobile/src/components/ArtifactWebView.tsx` (59 行) vs `viz.js` iframe sandbox。
- 容器 mobile `minHeight:220` (`:59`)（WebView 挂载需要），web 满血填充——可接受。
- 背景 mobile 预填 `colors.background` (`:35`)，web 透明（artifact 自绘）——可接受。
- CSP mobile 更严（无真 iframe 原语，`:19`）+ `ready/openLink` bridge (`:20`) + 双端 resize observer——意图一致。

### ComposerToolsMenu — 🔴 P0（见 §3.3）
232px popover + fade + 无 grabber + 缺 extension disclosure（详见 Modal 节）。

### ModelPickerModal — 🔴 P0（见 §3.5）
底部 sheet（`marginHorizontal:10 marginBottom:20 maxHeight:80% radius:12` `:217-222`）vs web inline popover（`min-width:220 max-width:320 max-height:320 radius:6 shadow` `:1219-1232`）。badge/字号/结构全差。

### ConfirmDialog — 🟡 P1（见 §3.6）
尺寸 ✅（`90% maxWidth:320 radius:14 padding:24/20/16` `:123-131` vs `:2291`）；背景/边框 alpha ✅。差：无 `box-shadow 0 8px 32px`、无 `slideUp .15s`（mobile fade `:39`）；字 bypass fontScale（15 vs 16.9，13/20 vs 14.6/21.9）；danger mobile `dangerSoft` vs web `hsl(0 60% 15%)` (`:2298`)；无焦点管理/Esc（web `ConfirmDialog.tsx:24-81`）。

### ErrorBoundary — 🔴 P2（意图不同，无需 1:1）
mobile 400px 卡片（64 图标 + 18/700 标题 + mono 12 错误盒 + 46px accent 重试 `:50-143`）；frontend 内联小条（16px padding + 危险色文字 + text button）。mobile 锁 dark（`:7-11` 注释）。结论：保留 mobile 设计，不对齐。

### ProfileOverlay — 🔴 P0（见 §3.2）
无 avatar、6 字段子集、无语言/搜索/偏好/danger 区（详见 Modal 节）。

### StorageOverlay — 🔴 P0（见 §3.7）
透明行 vs web `bg-200 + border` 行；域名不同（mobile 本地估算 vs web archived 列表 + per-row Restore/Delete）。

### UsageOverlay — 🔴 P0（见 §3.3 注：maxWidth 错）
`maxWidth:min(480,contentWidth)` (`:82`) vs web `min(720px,94vw)` (`:2311`)——注释称对齐实际写错；active tab mobile `surfaceHover` vs web accent；可视化 mobile 横条 vs web 53×7 heatmap。

### 附件渲染 — 🔴 P0（无 mobile 端口）
mobile `MessageBubble :160-176` 只有 `document-text-outline` 16px + 裸 `<Image>`；缺 `fileIcons.tsx:103-121` 类型图标、composer 上方 chip 条（web `.attachment-chip radius:18 padding:3/10/3/3 12px + 28px 蓝色 icon 底` `:2121-2123`）、pending/progress 态 (`:2132-2135`)、remove hover/focus (`:2129,844`)。`Composer.tsx:11-25` props 无 `attachments/onRemove` 槽位。

## §3 Modal Audit（8 个 Modal + 2 个类 modal 面）

> 本节由主 agent 直写（原 modal subagent `ses_f9959fd9bffe55baFuXFg50XTZ` 因 Token Plan 上限失败）。
> 容器值以 `frontend/src/styles.css` 为准；mobile 以各 `*.tsx` 内联样式为准。
> 与 §2 重叠的 5 个 overlay（Confirm/Profile/Usage/Storage/ModelPicker）此处只记 mount/尺寸/动画/缺失功能，视觉细节见 §2。

### 3.1 CmdK — 🟡 P1
**Mobile**: `mobile/src/cmdK/CmdKPalette.tsx` (`Modal fade` `:250` + scrim `:259` + panel `radius:14 surface/border` `:265-271` + `inner maxWidth:640` `:413` + list `maxHeight:360` `:309`) / **Frontend**: `#cmdKOverlay + #cmdKModal` (`CommandPalette.tsx` + `cmdk.bridge`)
- 容器：mobile `radius:14` ✅ 对 `.cmd-k-modal { min(640px,92vw); max-height:60vh; bg-100; border 0.5px border-300/.25; radius:14px; shadow 0 24px 60px black/.45 }` (`:2012`)；`inner maxWidth:640` ✅。
- 挂载：mobile RN `Modal`（`App.tsx` 外再包一层）；frontend body portal + `hostIsMountedBy/markHostMountedBy` 去重（`CommandPalette.tsx:1,71-76`）。
- Scrim：mobile `colors.scrim`（dark `rgba(0,0,0,.68)`）；frontend `.cmd-k-overlay { hsl(black/.55) + blur(4px) + padding-top:min(18vh,140px) }` (`:1991`)。mobile 更暗且无 blur、无顶部偏移。
- 行：mobile active `surfaceHover` + 18px Ionicons（active accent `:313-328`）+ 14/12px (`:337,346`)；frontend 行结构（icon + title + snippet + kind/meta）由 `renderCmdKResultsHits` 遗产结构驱动（`CommandPalette.tsx:63-70` 注释）。
- 交互：mobile web 仅 `onHoverIn → setSelected` (`:315`)；frontend 全量 hover + `ArrowUp/Down/Enter/Esc` + input 自动聚焦（`CommandPalette.tsx:78-...`）。mobile `onKeyPress Esc` (`:293-296`) 仅 native。
- 修复：scrim 改 `.55 + blur(4px)`；panel 加顶部 `min(18vh,140px)` 偏移；补全键盘导航。

### 3.2 ProfileModal — 🔴 P0
**Mobile**: `ProfileOverlay.tsx` (`Modal fade` `:82` + scrim `:89` + 卡 `radius:16 maxWidth:min(420,contentWidth)` `:99-102,198`) / **Frontend**: `.profile-modal { 90%; max-width:360px; max-height:85vh; radius:16px; shadow 0 8px 32px; slideUp .2s }` (`:2246`)
- 尺寸 ✅（radius/width）；mobile 缺 shadow + slideUp（见 §5.8）。
- Header：web `.profile-header { column center; padding:28/20/20; gap:12; bg-100 }` + 64px avatar（首字母，`24 × scale` 600）(`:2247-2248`)；**mobile 无 avatar**，只有 email 副标题。
- 行：mobile `padding:sm/sm gap:12 hairline` (`:122-129`)；web `.profile-row { space-between; 13 × scale; padding:8/0; border-bottom 0.5px border-300/.06 }` (`:2256`)。mobile 左对齐 vs web 两端对齐；字 mobile 11 大写/14 vs web ≈14.6。
- 按钮：mobile sign-out 危险描边 (`:155-169`) vs web 实底 `bg-300 + hsl(0 60% 55%)` (`:2262`)；close mobile `surfaceHover` vs web `bg-200` (`:2264`)。
- 缺失：语言 toggle、web-search toggle、response/about textareas、prompt-templates 管理、clear cache、API settings、danger zone（`ProfileModal.tsx:108-303`）。

### 3.3 UsageModal — 🔴 P0
**Mobile**: `UsageOverlay.tsx` (`Modal fade` `:59` + 卡 `radius:16 maxWidth:min(480,contentWidth)` `:76-82,214`) / **Frontend**: `.usage-modal { min(720px,94vw); max-height:88vh; radius:16px; shadow; slideUp .2s }` (`:2311`)
- **maxWidth 写错**：mobile 480，注释称对齐 720 (`:213`)——直接改 720。
- 标题 mobile 18px (`:216`) vs web `16 × 1.125 ≈ 18 / 600` (`:2313`)（数值巧合，缺 fontScale）。
- Period tabs：mobile 包裹 pill（`surfaceRaised` 底 + active `surfaceHover` `:95-106`）；web 无包裹 pill，active 是 accent 实底 + oncolor 文字 (`:2322-2324`)。视觉强调不同。
- Total 值 mobile 18px (`:224`) vs web `20 × scale ≈ 22.5 / 700` (`:2319`)。
- 可视化：**mobile 横条**（`height:8 radius:4` `:170-172`）vs **web 53×7 heatmap**（`.usage-cal-day lv0-lv5` `:2326-2342`）——整个图表原语不同。
- 内容：web `dangerouslySetInnerHTML snap.bodyHtml` (`UsageModal.tsx:41`)；mobile 结构化 bars + JSON-stringified limits (`:128-201`)。Tier limits 可读 breakdown 缺失。
- 交互：web day hover outline + tooltip (`.usage-tooltip :2345`)，mobile 无。

### 3.4 ShareModal — 🔴 P0（route → modal）
**Mobile**: `ShareScreen.tsx`（32 行整屏路由：kicker + 31/38 heading + label 12 + url 14/21 + 50px 实底分享键 + Done `:32`）/ **Frontend**: `.share-overlay { fixed inset 0 rgba(0,0,0,.55) z:100 fadeIn .15s }` (`:2603`) + `.share-modal { 90%; max-width:400px; padding:24/20/20; radius:16px; shadow; slideUp .2s }` (`:2605`) + `ShareModal.tsx`（`share-opt radio` `:20-61` + header/close `:74-80`）
- mobile 整屏 vs web 居中 modal——按 parity 建议转为 modal。
- 缺失：visibility 三 radio 卡（Public/Link-only… `.share-opt` `:2610-2617` + radio dot）、Copy 按键（`.share-copy-btn padding:8/14 radius:8 accent` `:2624`，mobile 只有 `native.share`)、Revoke（`.share-revoke` 红链 `:2627`）、status/error（`.share-status/.share-error` `:2630-2631`)。
- 挂载：web `OVERLAY_ID='shareOverlay'` body portal + 点击 overlay 关闭 + Esc；mobile 走 Navigation stack + `goBack()`。

### 3.5 ModelPickerModal — 🔴 P0（sheet vs popover）
**Mobile**: `ModelPickerModal.tsx` (`Modal fade` `:97` + scrim `:98` + `marginHorizontal:10 marginBottom:20 maxHeight:80% radius:12` `:217-222`) / **Frontend**: `.chat-model-menu.model-picker-menu { absolute; min-width:220 max-width:320 max-height:320; bg-100; border border-300/.4; radius:6px; shadow 0 4px 12px black/.3 }` (`:1219-1232`)
- 形态：mobile 底部 sheet；web 行内 popover。maxHeight 80% vs 320px；radius 12 vs 6。
- Header mobile `padding:18/14 17px` (`:224-238`) vs web cmd-k 头部 `padding:14/16` (`:2013`)。
- 搜索 mobile 40px radius 8 (`:246-255`)；行 mobile `padding:14 border radius:12` (`:271-274`) vs web 简单行。
- Provider badge mobile `padding:8/2 radius:8 border 11px` (`:284-289`) vs web `.profile-status-badge 10px padding:2/8 radius:10` (`:2283`)。
- 交互：web trigger caret 开合旋转 (`:1218`) + `:focus-visible outline` (`:1105`)，mobile 无。

### 3.6 ConfirmDialog — 🟡 P1
**Mobile**: `ConfirmDialog.tsx` (`Modal fade` `:39` + scrim `:40` + `90% maxWidth:320 radius:14 padding:24/20/16` `:123-131`) / **Frontend**: `.confirm-dialog { rgba(0,0,0,.65) z:200 fadeIn .12s }` (`:2289`) + `.confirm-box { bg-000; border 0.5px border-300/.15; radius:14px; 90% max-width:320px; padding:24/20/16; shadow 0 8px 32px; slideUp .15s }` (`:2291`)
- 尺寸/背景/边框 ✅；缺 shadow + slideUp（mobile fade）。
- Scrim mobile `.68` vs web `.65`——接近，可统一 `.65`。
- 按钮结构 ✅（`padding:20/8 minHeight:36 radius:8 gap:8` `:144-155` vs `:2295`）；danger mobile soft tint vs web `hsl(0 60% 15%)` (`:2298`)。
- 挂载：web 焦点记忆 + `data-initial-focus` + Esc + backdrop 点击 (`ConfirmDialog.tsx:24-81`)；mobile 只有 backdrop Pressable (`:41`) + Android back。

### 3.7 StorageModal — 🔴 P0（域名不同）
**Mobile**: `StorageOverlay.tsx` (`Modal fade` `:104` + 卡 `radius:14 maxWidth:min(460,contentWidth)` `:121-125,229`) / **Frontend**: `.storage-modal { min(560px,92vw); max-height:75vh; column }` (`:382`) + body `padding:14/18/18 gap:12` (`:434`)
- 宽度 mobile 460 vs web 560；radius 14 ✅（对 `.cmd-k-modal radius:14` `:2012`）。
- 行：mobile 透明行 `paddingVertical:sm gap:12` (`:147-152`)，标题 13px ✅ (`:439`)，meta 11px ✅ (`:440`)；web `.storage-row { gap:12 padding:10/12 radius:8 bg-200 border 0.5px border-300/.15 }` (`:437`)——层级不同。
- **域名不同**：mobile 本地估算（sessions/messages/attachments/profile/draft/total `:53-77`）+ `clearArmed → ConfirmDialog` (`:85-98,211-220`)；web archived 列表 + per-row Restore/Delete forever (`StorageModal.tsx:42-43`)。空态 web 居中 `padding:32/12 13px` (`:447`)。
- 修复：先对齐视觉（行加 bg-200 + border），再定域名（保留 mobile 估算 + 补 archived 列表，或二选一文档化）。

### 3.8 MorePopover → MoreScreen — 🔴 P0（popover → route）
**Mobile**: `MoreScreen.tsx`（58 行整屏）/ **Frontend**: `MorePopover.tsx`（7 项行内 popover）
- mobile 5 项 vs web 7 项（缺 Plugins/Exam/Skills/Shortcuts/DisplayPrefs，见 §1.17）。
- mobile 行 72px hairline + 15px 700 (`:57`)；web 36px 按钮。
- 修复路径二选一：窄屏保留整屏（补齐 7 项 + 复用 popover 行高），或宽屏转 popover。

### 3.9 PromptTemplatesModal — 🔴 P0（mobile 缺失）
**Mobile**：无文件 / **Frontend**：`.prompt-templates-modal { min(620px,92vw); max-height:80vh; column }` (`:408`) + `PromptTemplatesModal.tsx`（overlay 复用 `cmd-k-overlay` 类 + `bodyHTML` 网关 `:30-40` + `data-prompt-command` 委托 `:16-26`)
- mobile 需新建 `mobile/src/modals/PromptTemplatesModal.tsx`（按 parity 表 Phase 3.6），挂载仿 `specs.tsx` 网关。

### 3.10 SettingsOverlay — 🔴 P0（route vs modal，见 §1.12）
mobile 整屏 `SettingsScreen` vs web `.settings-modal`（440px，见 §3.2 同类值 `:2210`）。转 modal 或文档化保留整屏。

**Modal 共性**：mobile 全部 `animationType="fade"` + `colors.scrim`（dark `.68` / light `rgba(26,22,14,.45)`），无自定义 curve（见 §5.8）；frontend scrim 按面取 `.55/.65/.7` + `fadeIn .12-.16s`，主体 `slideUp .15-.2s var(--ease-out)`。统一方案：新建 `<Overlay>`（scrim fade `.15s` + body `slideUp .18s cubic-bezier(.16,1,.3,1)`），ComposerTools/ModelPicker 用 sheet 变体 `.32s cubic-bezier(.22,1,.36,1)`；≤768px 关 BlurView。

## §4 Token Audit（设计 token 1:1）

> Source: subagent `ses_f9959fd93ffeikcfaW8DTUqA5Q`。基线：`mobile/src/theme/theme.ts` + `packages/theme/src/*` vs
> `frontend/src/styles/tokens.css` + `themes.css` + `styles.css` + `ui/tokens.{ts,js}` + `ui/motion.js` + `displayPrefs.js`。
> ✅ 的 ladder 只列结论；❌/⚠️ 列双边值 + 源 + 修复文件。

### 4.1 Color（dark）—— ✅ 14 / ⚠️ 11 / ❌ 12
- ✅：`surfaceHover #363636`、border `#383838`、text `#fff`、textInverse、accent `#e9be53`、accentSoft `#473c1f`、`white/black`。源 `packages/theme/src/rn.ts` ↔ `styles.css:29-30` + `themes.css`。
- ⚠️（选修但影响 1:1）：
  1. `background`：mobile `#212121`（经 `rn.ts:82`）vs frontend `tokens.ts:178` 声明 `#101318`——但 frontend 实际渲染 `hsl(var(--bg-100)) = #212121` (`styles.css:29,112`)。**frontend 内部先分裂**，mobile 跟的是渲染真相。修 `frontend/src/ui/tokens.ts:178`。
  2. `surface / surfaceRaised`：同上，`themes.css --ui-bg-raised/overlay` 与 `styles.css --bg-200/--bg-000` 互换。mobile 跟渲染真相。
  3. `borderStrong`：mobile `#383838`（= default）vs `themes.css:47` `0 0% 32%`；渲染用 `--border-400 0 0% 22%`。mobile 跟渲染真相。
  4. `brand`：mobile `#d19a47`（≈33° 60% 55%）vs web `36 60% 55%`—— hue 差 ~3° (`theme.ts:129` vs `styles.css:29`)。
  5. `success`：mobile `145 50% 50%` vs `themes.css:50` `142 60% 50%`——mobile 跟渲染字面量 (`:232`)。
  6. `danger`：mobile `#dd5f5f` (`0 65% 62%`) vs `themes.css:49` `0 60% 55%`——mobile 跟渲染字面量 (`:589`)。
  7. `toolCardBgHover/Border/BorderStrong`：alpha 差 .04–.08（mobile `rn.ts:196,198,199` vs `styles.css:54-56,80-82`）。
- ❌（mobile-only，无 web 等价）：
  - `brandSoft rgba(209,154,71,.16)`、`successSoft #1c3a2b`、`dangerSoft #3a1f1f` (`theme.ts:130-132`)；`scrollbar`、`codeBg/Fg/Border`、`reasoningBg/Fg`、`toolCardBgSunken`、`toolCardFocus` (`rn.ts:188-200`)；`warning` mobile 缺定义（web 行内 `hsl(38 90% 55%/.12)` `:1950`)。
  - ~~`scrim` mobile `.68` (`theme.ts:119`) 在 web 不存在；web 按面 `.55`（settings/profile/usage/share/exam `:2207-2603`）/ `.65`（confirm `:2289`）/ `.7`（sidebar backdrop `:2985`）/ `.52`（workspace `:588`）/ `.55` + blur（cmd-k `:1991`)。~~ **2026-09-18 已修**：`theme.ts` 引入 `scrimModal .55 / scrimConfirm .65 / scrimDrawer .7` 三层（`scrim` = `.55` 别名），ConfirmDialog/CmdK/Settings/DisplaySettings 已接。

### 4.2 Color（light）—— ✅ 6 / ⚠️ 8
- ✅：`surfaceHover #e3dfd9`、border/borderStrong、accent `#b18925`、accentSoft、danger。
- ⚠️：`background/surface/surfaceRaised/text/textMuted/textSubtle/success/brand` 全部是"mobile 跟渲染真相，`themes.css` 另写一套"（如 `background` mobile `#f7f6f2` = 渲染 `--bg-100`，`tokens.ts:210` 却写 `#e6dec8`；`text` mobile `34 10% 16%` = 渲染 `--text-100`，`themes.css:67` 写 `36 12% 10%`）。修 `tokens.ts:210` + `themes.css:62-75`。

### 4.3 Spacing / Radius — ✅
- `xxs2/xs4/sm8/md12/lg16/xl24/xxl32` (`theme.ts:172-178` ↔ `tokens.css:16-22` + `tokens.ts:107-113`) 全对。
- `none0/sm4/md8/lg12/pill999` (`theme.ts:182-194` ↔ `tokens.css:25-29`) 全对。mobile `xs:4/xl:12` 仅 compat 别名。

### 4.4 Typography family — 🟡 P2
- Sans ✅（双边同串，`theme.ts:204` ↔ `styles.css:29-30`）。
- Display ⚠️：mobile 缺 `"Songti SC","SimSun"` (`theme.ts:220` vs `styles.css:29-30`)。
- Mono ⚠️：mobile 多 4 个 fallback（`SFMono-Regular,Menlo,Monaco,Consolas` `:227-228`），web 短串。
- CJK ⚠️：mobile 加 `"Microsoft YaHei"`，web zh-override 首选 `"Hiragino Sans GB"` (`:35`)。

### 4.5 Typography size/weight/line-height/letter-spacing — 🟡 P1
- Ramp 词汇错位：mobile 12 阶（10/11/12/13/14/15/16/18/22/26/30/34）vs frontend 7 阶（12/13/14/16/18/20/24 `tokens.css:32-38`），其余全行内硬编码。Body 14 ✅ (`theme.ts:238` ↔ `:112`)。
- Weight：frontend 大量 `550/650`（如 `.library-name` 等），mobile 无此档——会 over-bold。
- Line-height：mobile 12 个 per-size (`theme.ts:247-258`)；frontend 只有 `tight1.2/normal1.5/relaxed1.7` + 行内数字。
- Letter-spacing ❌：mobile 无 token；frontend body `-0.01em` (`:112`)、logo `-0.03em` (`:198`)、大写标签 `.06/.04em`。mobile 大写用裸 `letterSpacing:1.5`（px vs em）。

### 4.6 Shadow — 🟡 P2（仅 authCard 1:1）
- `authCard` ✅ 精确对（`offset 0/12 op .5 r 48 e 12` `theme.ts:275-280` ↔ `0 12px 48px black/.5` `:3014`）。
- 其余 ❌：mobile 只有 `card/sheet`；frontend 无 `--ui-shadow-*`，约 30 处行内（popover `0 12px 36px black/.35` `:302`、modal `0 8px 32px` `:2210`、cmd-k `0 24px 60px/.45` `:2012`、toast `0 6px 20px/.25` `:1929` 等）。Composer mobile `op .05 r 14` vs web `0 .35rem 1.8rem black/5%` (`:1079,2097`)——y 对 blur 减半近似。

### 4.7 Motion — 🔴 P0
- ~~`easing.out/spring` 在 `packages/theme/src/tokens.ts:142-147` 已导出，**mobile 从未 import**；mobile press 全走 `Animated.spring(18,260,0.7)`，web `cubic-bezier(.16,1,.3,1)` / `(.34,1.3,.64,1)` (`tokens.css:56-57`)。~~ **2026-09-18 已修**：`theme.ts` 导出 `motionEasing`（`Easing.bezier` 包装），press/drawer/panel/toggle 全接入 timing。
- Composer `cubic-bezier(.22,1,.36,1)` (`:1079` + `motion.js:51`) web-only；velocity planner（1800px/s，90–520ms，snap 24 `motion.js:47-50`）mobile 无（仍缺）。

### 4.8 Display prefs — ✅（2 处小差）
- ✅：`fontScale 1.125`、steps `[1,1.125,1.25,1.375]`、width steps `[.85,1,1.3,1.7]`、labels S/M/L/XL、base 928（58rem）、grid 默认关。(`displayPrefsStore.ts:20-59` ↔ `displayPrefs.js:10-17` + `styles.css:1050`)。
- ❌：accent presets mobile `null`（无 hue 列表），web `[35,160,210,270,330,40]` (`displayPrefs.js:303-323`)；bg picker mobile 存 `null`，web fallback `#212121/#ffffff` (`tokens.js:21,24` + `displayPrefs.js:237,239`)。

### 4.9 Breakpoints / Z-index — 🟡 P2
- 断点 ✅：480/768/1200 (`responsive.ts:6-8` ↔ `tokens.ts:160-162`)；web 另有 520/560/600/640/720 ad-hoc。抽屉宽 mobile 单值 288 (`:17`) vs web 16/18/20rem + `#appShell` 260/276 (`:176,4345,4362,9542,10015`)。
- Z-index ❌：mobile 仅 2 个显式值（AppHeader 10、Chat 20）；frontend 约 25 个行内值（5/6 → 25/30 → 50/60/75/80 → 100/160/200 → 850/900/950/960/999 → 1200/1500/2000/2400 → 2147483647）。无共享层系。

**Token 修复文件清单**：`mobile/src/theme/theme.ts`（brand/soft/scrim/family）；`packages/theme/src/rn.ts`（toolCard/scrollbar/code/reasoning alpha）；`packages/theme/src/tokens.ts`（easing 接入、success hue）；`frontend/src/ui/tokens.ts:178,210`（bg.page 与渲染对齐）；`frontend/src/styles/themes.css`（--ui-bg-*/--ui-text-*/--ui-border-strong/--ui-success/danger 与渲染对齐）；`frontend/src/styles.css`（shadow/550-650/letter-spacing/z-index 行内值收敛）；`mobile/src/displayPrefs/displayPrefsStore.ts`（hue presets + bg 默认）。

## §5 Interaction State Audit

> Source: `mobile/src/**` vs `frontend/src/styles.css` / `frontend/src/ui/motion.js` /
> `ui/keyboard/index.ts` / `scrollPill.js` / `composerTools.js` / `sidebarResize.js`。

### 5.1 Pressed（按下缩放）— 🟡 P1

**Mobile behavior**:
- 通用 `AnimatedPressable` 给所有可点元素加 `transform: scale` 动画：1 → 0.975 → 1，用
  `Animated.spring`（`damping:18, stiffness:260, mass:0.7`），是过冲/回弹而非 tween。
  | `mobile/src/components/AnimatedPressable.tsx:12-23`
- 缩放系数硬编码为 `0.975`，没有按组件覆写。| `AnimatedPressable.tsx:12`
- 发送按钮没单独的 press 缩放（跟着 `AnimatedPressable` 走 `.975`）。| `Composer.tsx:194-216`
- ComposerToolsMenu 项走 wrapper spring。| `ComposerToolsMenu.tsx:112-156`
- ComposerToolsMenu label `onPress` 在执行 action 前 `setTimeout(..., 100)`（100ms 预滚）。
  | `ComposerToolsMenu.tsx:33-38`

**Frontend behavior**:
- 按组件用 `:active` 选择器各自选择缩放：
  - `.send-btn:active { scale(.88) }`、`.send-btn.active:active { scale(.92) }`。
    | `frontend/src/styles.css:2143, 2147`
  - `.icon-btn:active .92`、`.sidebar-view-btn:active .92`、`.kb-node:active .99`、
    `.user-row:active .99`、`.sidebar-more-item:active .985`、`.recents-new-btn:active .96`、
    `.start-btn:active .96`、`.start-btn.active:active .97`、`.color-swatch:active 1.05`、
    `.new-reply-pill:active .96`、`.display-prefs-seg:active .94`、`.accent-reset-btn:active .95`、
    `.composer-tools-item:active .985`、`.composer-quick-chip:active .97`、`.viz-btn:active .92`。
- 缓动是 `cubic-bezier(.4,0,.2,1)` 或 `var(--ease-out)` 配合 `.12s–.18s` 的 CSS transition，不是 spring。
  | `styles.css:29, 47, 201, 203, 222, 230, 461, 456, 664, 701, 1021, 876, 887, 917, 748, 811, 1272, 1019-1021`

**Diff**:
- 缩放：mobile 全平台统一 `.975`；frontend 每个组件在 `.88–.99` 之间取不同值。
- 缓动模型：mobile 用 `Animated.spring`（连续橡皮筋）；frontend 用 CSS transition。
- mobile 的发送按钮只能 `.975`；frontend 主动 `.88` / `.92`。
- mobile 在 ComposerToolsMenu 多了一个 100ms 的 action 延迟，frontend 没有。

**修复**:
1. `AnimatedPressable` 接受 `scale?: number` prop，让发送按钮可以 `.88`/`.92`。
2. composer-tools-menu 去掉 `setTimeout(..., 100)`。
3. 在 spring 和 tween 之间二选一作为统一模型（建议 tween 以贴合 web）。

---

### 5.2 Hover（鼠标悬停）— ✅ / 🟡 P2

**Mobile behavior**:
- RN 默认不支持 `:hover`，所以 mobile 没有任何 hover 着色；只有 `Cmd+K` 在 web build
  用 `onHoverIn` 切换选中行。| `mobile/src/cmdK/CmdKPalette.tsx:315`
- `AnimatedPressable` 只在 press 时改 `transform: scale`，不动 `opacity` / `backgroundColor`。
  | `AnimatedPressable.tsx:18-21`

**Frontend behavior**:
- 所有可点击面都有 `:hover` 改 `background` 或 `color`，例如：
  - `.recent-item:hover { background: hsl(var(--bg-300)) }`。| `styles.css:460`
  - `.icon-btn:hover { background: hsl(var(--bg-300)); color: hsl(var(--text-100)) }`。| `styles.css:202`
  - `.send-btn:hover { background: hsl(var(--bg-400)); color: hsl(var(--text-200)) }`。| `styles.css:2142`
  - `.new-reply-pill:hover { filter: brightness(1.08); transform: translateY(-2px); box-shadow: ... }`。| `styles.css:1020`
  - `.color-swatch:hover { transform: scale(1.18); box-shadow: ... }`。| `styles.css:887`
- 时长：`.18s` for color/border、`.12s` for transform；缓动 `var(--ease-out)`。| `styles.css:201, 219, 454, 968`

**Diff**:
- mobile 无 hover wash；frontend 全平台加 `bg-300` 着色。
- mobile web build 的 Cmd+K 是 hover-driven，其它组件没有视觉 hover。

**修复**:
- 触屏平台上 RN 不需要视觉 hover。mobile web build（如 `mobile export:web`）需要在 `AnimatedPressable` 上
  把 hover 当作轻量的视觉反馈（用 `onHoverIn` 调透明度/背景），让 web build 不会"少一步"。

---

### 5.3 Focus ring（键盘焦点环）— 🔴 P0

**Mobile behavior**:
- 没有 `:focus-visible` 等价物；RN 默认 View/Pressable 也不画焦点环。
- `AnimatedPressable` 只设 `accessibilityRole`，没有视觉 focus。| `AnimatedPressable.tsx:18`
- `mobile/src/components/*.tsx` 没有任何 `outline`/`focus-visible` 规则。

**Frontend behavior**:
- 全局：`button:focus-visible, a:focus-visible { outline: 2px solid hsl(var(--accent-000)/.85); outline-offset: 2px; border-radius: 4px }`。
  | `styles.css:121`
- 元素级：
  - `.sidebar-resize-handle:focus-visible { outline: 1px solid hsl(var(--accent-000)); outline-offset: -2px }`。| `styles.css:193`
  - `.model-picker-trigger:focus-visible { outline: 1px solid hsl(var(--accent-000)/0.5); outline-offset: 1px }`。| `styles.css:1105`
  - `.model-picker-item:focus-visible { outline: 1px solid hsl(var(--accent-000)/0.5); outline-offset: -1px }`。| `styles.css:1159`
  - `.kb-graph-node:focus-visible circle { stroke: hsl(var(--accent-000)); stroke-width: 2 }`。| `styles.css:242`
  - `.composer-tools-item:focus-visible { box-shadow: inset 0 0 0 1px var(--tool-card-border-strong) }`。| `styles.css:747`
  - `.composer-extension-token-remove:focus-visible { outline: 2px solid hsl(var(--accent-000)/.7); outline-offset: 1px }`。| `styles.css:844`
  - `.thinking-panel-close:focus-visible { outline: 1.5px solid hsl(var(--accent-000)/0.65); outline-offset: 1px }`。| `styles.css:6306`
  - `.new-reply-pill:focus-visible { outline: 2px solid hsl(var(--accent-200)); outline-offset: 2px }`。| `styles.css:1022`
  - `.send-btn:focus-visible` / `.attach-btn:focus-visible { outline: 2px solid hsl(var(--accent-000)/.65); outline-offset: 2px }`。| `styles.css:5067`
  - `.rich-composer-tool:focus-visible { outline: 2px solid hsl(var(--accent-000)/.55); outline-offset: 1px }`。| `styles.css:4855`
- 颜色：`hsl(var(--accent-000))` ≈ dark `43 77% 62%` / light `43 65% 42%`。
- 描边宽：1–2px；offset：1–2px。

**Diff**:
- mobile 完全不画焦点环；frontend 在 12+ 元素上画 1–2px 焦点环。

**修复**:
- 在 `AnimatedPressable`（或抽出一个 `useFocusRing`）里：focus 时叠 `borderColor: colors.accent` 或
  `box-shadow`，1.5–2px。键盘导航用户（外接键盘的 iPad/Android、TV、Web build）必须能看到焦点。

---

### 5.4 Disabled（禁用态）— 🔴 P0

**Mobile behavior**:
- RN 的 `Pressable` 在 `disabled` 时短路 `onPress`，但不自动调透明度或颜色。
- `AnimatedPressable` 把 `disabled` 透传，但 `onPressIn` 仍触发 `.975` 缩放。
  | `AnimatedPressable.tsx:16-21`
- Composer 发送按钮：靠 `canSend` 切 `colors.accent` ↔ `colors.surfaceHover`，但 disable 时
  仍可以按到（squash），只是 `onPress` 不发；`accessibilityState.disabled` 设了。| `Composer.tsx:108, 196-216, 292-315`
- `ConfirmDialog` 的 OK/Cancel、`AppDrawer` rename save 都没视觉 disable，靠禁止 `onPress`。

**Frontend behavior**:
- 通用样式：
  - `.library-bulk-delete:disabled { opacity:.35; cursor:default }`。| `styles.css:577`
  - `.msg-retry-btn:disabled { opacity:.5; cursor:wait }`。| `styles.css:3434`
  - `.exam-btn.primary:disabled { opacity:.3; cursor:default }`。| `styles.css:2521`
  - `.settings-btn.primary:disabled, .settings-btn.primary.saving { opacity:.6; cursor:not-allowed; pointer-events:none }`。| `styles.css:2237`
  - `.auth-btn.primary:disabled { background: hsl(var(--bg-300)); color: hsl(var(--text-500)); cursor:not-allowed }`（完整换肤）。| `styles.css:3050`
  - `.rich-composer-tool:disabled { opacity:.3; cursor:default }`。| `styles.css:4854`
  - `.inline-practice-{textarea,reveal,submit}:disabled { opacity:.5–.6 }`。| `styles.css:3156, 3160, 3163`
- 透明度范围 `.3`–`.6`，部分用 `pointer-events:none` 强制阻止点击。

**Diff**:
- mobile 不统一处理 disable：只有 Composer 发送按钮有 idle 灰色，其它都裸奔。
- disable 的按钮仍走 `.975` spring；frontend 用 `:not(:disabled):hover/:active` 抑制样式。
- mobile 没法给 `cursor:not-allowed`（native 不支持）；但 web build 必须显式置灰。

**修复**:
1. `AnimatedPressable` 接受 `disabledOpacity` 并在 `disabled` 时跳过 spring。
2. `ConfirmDialog` / `AppDrawer` rename save 等 disable 的按钮统一加 opacity 0.5。
3. 在 web build 里映射到 `cursor:not-allowed` + `pointer-events:none`。

---

### 5.5 Loading（spinner / skeleton / streaming）— 🟡/🔴 P0（skeleton 缺失）

**Mobile behavior**:
- Spinner：`<ActivityIndicator size="small|large" color={colors.accent} />`，没有自定义 curve 或
  keyframe；用 RN 平台默认。
  - ExamScreen 卡片中心 spinner。| `ExamScreen.tsx:147`
  - ToolCard 行内覆盖小 spinner。| `ToolCard.tsx:325, 369`
  - 多个 Screen 的 section spinner。| `LibraryScreen.tsx:145`, `KnowledgeScreen.tsx:40`
  - Auth/Settings 按钮内 spinner。| `AuthScreen.tsx:44`, `SettingsScreen.tsx:162`
- Streaming/思考指示：写在 `MessageBubble` 的可折叠"Thinking…"卡里；图标在 `sync-outline`（流中）和
  `bulb-outline`（结束）之间切换，14px，颜色 `colors.accent`。是静态 glyph，没有旋转。| `MessageBubble.tsx:126-156`
- Skeleton：mobile **没有** skeleton 组件；空列表用 `ActivityIndicator` 或纯文字"暂无"。
- Progress bar：没有；`RichBlock` 退回居中 `ActivityIndicator`。| `RichBlock.tsx:260-261`
- 流中断错误行：行内有 `Ionicons alert-circle-outline` + 错误文字 + 内联文字 Retry 按钮；背景
  `colors.surfaceRaised`，无 border，padding `16/6`，margin `12/6`，radius 8。| `ChatScreen.tsx:306-323`

**Frontend behavior**:
- Spinner 原语：`.loading { width:16px; height:16px; border:2px solid hsl(var(--border-300)/0.20); border-top-color: hsl(var(--accent-000)); animation: loadingSpin 1.2s cubic-bezier(.65,0,.35,1) infinite }`。
  | `styles.css:2161-2199`
- 变体：
  - `.loading-pulse::before/::after`（`.pulseRing 1.6s`）。| `styles.css:2167-2171`
  - `.thinking-ring::before + ::after`（`.ringSpin 1.2s`）。| `styles.css:2178-2180`
  - `.thinking-spinner` 12/14px 圆环 `.ringSpin .9s cubic-bezier(.4,0,.2,1) infinite`。| `styles.css:3346-3359`
  - `.thinking-spinner::after` 单独做 `thinkingDotPulse 1.8s`。| `styles.css:3362-3372`
  - `.diag-progress-step .diag-progress-spin { loadingSpin .8s linear infinite }`。| `styles.css:1413`
  - `.agent-tool-progress-spinner { agent-tool-spin .7s linear infinite }`。| `styles.css:3601-3602`
  - `.exec-artifact-skeleton::after { exec-artifact-spin .9s linear infinite }`。| `styles.css:3644-3645`
- Skeleton 原语：`.shimmer { background: hsl(var(--bg-200)); border-radius:6px }` + `::after` 跑
  `shimmerSweep 2s ease-in-out infinite`。两个变体 `.shimmer-line { height:12px; margin-bottom:8px; width:100% }`，
  last-child `width:65%`。| `styles.css:2192-2197`
- Viz skeleton 生命周期：`.viz[data-viz-state="loading"] .viz-loading { animation: viz-skeleton-fadeout 800ms ease-out 0s 1 forwards }`。
  | `styles.css:2733-2741`
- Streaming/Thinking 指示（`TurnStatus.tsx`）：统一一个 `.thinking-spinner`；`.thinking-status-clickable`
  有 hover/active/focus 全套，`.15s ease` transition；`.thinking-dot.thinking-elapsed-shown::after` 12s
  后插入 elapsed `s`。| `styles.css:3329-3342`
- 流中断错误行（`.msg-error`）：flex gap 8 padding 6/10 border `0.5px hsl(0 60% 50%/0.25)` radius 8
  透明背景 color `hsl(0 60% 70%)` 12px；Retry 是 pill，0.5px `hsl(var(--accent-000)/.35)` 边框，透明填充，
  accent 文字，hover 切到 accent 背景。| `styles.css:3429-3434`

**Diff**:
- Spinner 缓动：mobile 用平台默认（iOS ~ 1s，Android ~ 1.2s）；frontend 自定义
  `cubic-bezier(.65,0,.35,1)` 1.2s + 多个变体（`.9s` / `.7s` / `.8s`）。
- Skeleton：mobile **完全缺失**；frontend 有 `.shimmer`（2s sweep）和 `.shimmer-line`。
- Streaming 视觉：mobile 是静态 `sync-outline` 14px 图标；frontend 是自转 12–14px 圆环 + `::after` dot 脉动。
- Reasoning card：mobile 永远在 `MessageBubble` 里 inline；frontend 拆成 `.thinking-placeholder` /
  `.thinking-status` / `.think-summary`，并且点击会展开一个 side drawer / bottom sheet。
- 错误行：mobile 是 `surfaceRaised` 填充；frontend 是 accent-bordered 透明卡片。

**修复**:
1. `MessageBubble` 把 `sync-outline` 换成自转 ring（`react-native-reanimated` 驱动）。
2. 新增 `Skeleton` 组件，仿 `.shimmer` + `.shimmer-line`。
3. 错误行用 `colors.danger` 描边 + 透明背景，匹配 `.msg-error`。

---

### 5.6 Empty / Zero-state — 🟡 P1

**Mobile behavior（逐屏）**:
- RecentsScreen 空态：`Ionicons library-outline` 34px (`colors.textSubtle`) + 标题 (`t('library.emptyTitle')`
  17px semibold `colors.text`) + 副文 (`t('library.emptyBody')` 12px body `colors.textMuted`)。无 CTA，无动画，
  `paddingTop:110` 居中。| `RecentsScreen.tsx:179-186, 253-255`
- KnowledgeScreen：标题 24px display，副文 14px muted，无图标，无 CTA，`paddingTop:130`。
- MistakesScreen / LibraryScreen / SearchScreen：纯文字空态。
- ChatScreen：`ListEmptyComponent={<View style={styles.empty} />}`（0 高度占位）。| `ChatScreen.tsx:288`
- NewChatScreen landing：32px display 字体问候语（`colors.textMuted`），`ideasLabel` ("Ideas for you")，
  两行 `AnimatedPressable` idea 卡片（24px 圆盘 + 14px 图标）。**没有 entrance 动画**。| `NewChatScreen.tsx:163-217, 316`
- AppDrawer recents 空：12px italic 单行（`search.noMatches` / `chat.emptyHistory`）。| `AppDrawer.tsx:343-346`
- CmdKPalette 空：单行 "No matches" 13px muted。| `CmdKPalette.tsx:364-373`
- AuthScreen 后置错误空：`<Ionicons alert-circle-outline warning />` + 14px display 标题 + 13px 副文。| `AuthScreen.tsx:251`

**Frontend behavior**:
- `.workspace-empty { flex column; align-items center; padding 30px 16px; gap 7px; color: hsl(var(--text-500)); font-size: calc(12px * --sidebar-font-scale); line-height:1.5 }`，strong 用 550 / `text-200` / 13px。| `styles.css:586`
- Landing 入场：
  - `.topic-title { font-size: clamp(1.8rem, 1.32rem + 1.9vw, 2.5rem) * --app-font-scale; weight:560; color: hsl(var(--text-200)); line-height:1.28; animation: emptyStateIn .4s var(--ease-out) both }`。| `styles.css:1074`
  - `.topic-sub { 14px text-400; line-height:1.5; max-width:640; emptyStateIn .4s var(--ease-out) 70ms both }`。| `styles.css:1075`
  - `.topic-input-wrap { emptyStateIn .4s var(--ease-out) 140ms both }`。| `styles.css:1086`
  - `@keyframes emptyStateIn { from { opacity:0; transform: translateY(8px) } to { opacity:1; transform: translateY(0) } }`。| `styles.css:1078`
- Greeting 变体：`.topic-title.greeting { font-family: Newsreader; weight:400; font-size clamp(2rem, 1.5rem + 2vw, 2.75rem); color: text-100 }`，≤768px 降到 1.5rem / 1.25rem。
  | `styles.css:5188, 4329, 4355`

**Diff**:
- Stagger 动画：frontend 0/70/140ms 错峰入场；mobile 一次性全部呈现。
- 图标：mobile Recents 有 34px `library-outline`；frontend 完全没有图标。
- 布局：mobile 居中 110–130 paddingTop；frontend 紧贴 panel `padding 30px 16px`。
- 颜色：mobile `colors.textSubtle`（最暗）vs frontend `hsl(var(--text-500))`。
- Greeting 字号：mobile 写死 32px；frontend clamp 1.8rem → 2.5rem（`.greeting` 变体 2rem → 2.75rem）。

**修复**:
1. 加 `emptyStateIn` keyframe 到 mobile（Reanimated 实现），`greeting` / `ideasLabel` / `composer` 错峰 0/70/140ms。
2. RecentsScreen 空态可以去掉图标与 frontend 一致（保留也可以，作为视觉加强）。
3. Greeting 字号按 `useWindowDimensions().width` 做 clamp。

---

### 5.7 Error / Failure（toast / banner / inline）— 🔴 P0（无 toast）

**Mobile behavior**:
- 行内 banner：`ChatScreen.tsx:306-323` — `.errorRow` 行，18px `Ionicons alert-circle-outline`
  (`colors.danger`) + 12px `colors.danger` 文字 + 可选 Retry（`AnimatedPressable` 文字按钮）。| `ChatScreen.tsx:474-486`
- 表单错误：写入 `state.error`，由 `appStore.setError(message)` 投递；`ChatScreen` 的 banner 消费。
  没有专门的 field-error 样式层。
- ToolCard 下载错误：行内 `<Text style={styles.artifactError}>` 12px `colors.danger`。| `ToolCard.tsx:328`
- Usage / Storage 错误：行内 `<Text style={styles.error}>` 12px `colors.danger`。| `UsageOverlay.tsx:128-129`
- RecentsScreen 错误：纯 `<Text>` 12px `colors.danger`，无图标。| `RecentsScreen.tsx:145, 256`
- **Toast / Snackbar：mobile 没有**。多处用 `Alert.alert(...)`（原生对话框）：
  upload 失败（`RecentsScreen.tsx:75`）、session 动作（`AppDrawer.tsx:203`）、
  profile 错误（`SettingsScreen.tsx:77`）。
- `CmdKPalette.tsx:136` 有注释 `/* ignore — surface in toast later */`，确认 toast 还没建。

**Frontend behavior**:
- `.msg-error` 行内错误（描述见 §5.5）。| `styles.css:3430`
- Retry pill：`.msg-retry-btn` 0.5px `hsl(var(--accent-000)/0.35)` 边框、透明 bg、accent 文字、
  11.5px、hover 切到 accent 填充 + oncolor-100。`:disabled { opacity:.5; cursor:wait }`。| `styles.css:3432-3434`
- Toast 容器：`.alert-container { position:fixed; bottom:24px; right:24px; z-index:2000; flex column-reverse; gap:8px; pointer-events:none; max-width:400px }`。| `styles.css:1928`
- Toast 项：`.alert-item` flex padding 12/14 radius 10 1px border box-shadow `0 6px 20px hsl(var(--always-black)/0.25)`
  `animation: alertSlideIn .3s var(--ease-out)`；`transition: opacity .2s, transform .2s`；13px body 1.5。
  | `styles.css:1929`
- 类型变体：success / info / warning / error，每个有 tint 背景（如 `.alert-error { background: hsl(0 75% 50%/0.10); border-color: hsl(0 75% 50%/0.25); color: hsl(0 70% 40%) }`）。| `styles.css:1953-1955`
- 入口：`@keyframes alertSlideIn { from { translateX(40px); opacity:0 } to { translateX(0); opacity:1 } }`。| `styles.css:1958`
- 出口：`.alert-item.alert-exit { opacity:0; translateX(40px) } .2s`。| `styles.css:1930`
- Confirm scrim：`.confirm-dialog { background:rgba(0,0,0,.65); z-index:200; animation: fadeIn .12s }`，
  confirm box `.15s var(--ease-out) slideUp`。| `styles.css:2289-2291, 2209-2211`

**Diff**:
- mobile **没有** toast/snackbar 系统；fallback 到 `Alert.alert`，这与 frontend 主题化栈不一致。
- 错误行样式：mobile `surfaceRaised` 背景 + danger 文字；frontend 透明 + 危险色描边。
- 入/出动画：mobile 都没有；frontend `.alertSlideIn .3s var(--ease-out)` 入、`.2s` 出。

**修复**:
1. 建 `Toast` 组件（success / info / warning / error），web 右下、native 底部居中 safe-area；入口
   `alertSlideIn .3s var(--ease-out)`，出口 `translateX(40px) .2s`。
2. 把 `Alert.alert` 调用点（recents upload、session action、profile error 等）切到 Toast。
3. 错误行采用 `.msg-error` 风格（透明背景 + danger 描边）。

---

### 5.8 Modal / sheet 入场动画 — 🔴 P0（统一化）

**Mobile behavior**:
- 全部 overlay 走 `<Modal transparent animationType="fade">` 或 `animationType="slide"`，由 RN 平台
  默认缓动，没有自定义 curve。
- ConfirmDialog / AppDrawer / ComposerToolsMenu / ProfileOverlay / UsageOverlay / StorageOverlay /
  ModelPickerModal / CmdKPalette 全部 `fade`。| 见各处 `:82, :59, :104, :97, :250`
- RecentsScreen preview 用 `slide` 做 bottom sheet；rename 用 `fade`。| `RecentsScreen.tsx:188, 207`
- ScheduledScreen / ProjectsScreen / PluginsScreen editor modal 用 `slide`。| `ScheduledScreen.tsx:133`, `ProjectsScreen.tsx:115`, `PluginsScreen.tsx:90`
- AppDrawer rename dialog 用 `fade`。| `AppDrawer.tsx:452`

**Frontend behavior**:
- Scrim：纯 `fadeIn .12–.16s ease`：
  - `.confirm-dialog { fadeIn .12s }`。| `styles.css:2289`
  - `.profile-overlay / .usage-overlay / .settings-overlay / .share-overlay / .exam-overlay { fadeIn .15s }`。
    | `styles.css:2207, 2244, 2309, 2594, 2603`
  - `.sidebar-backdrop { fadeIn .15s }`。| `styles.css:2985`
  - `.thinking-panel-backdrop { fadeIn .16s ease }`。| `styles.css:6233`
  - `.tutor-explore-overlay { fadeIn .16s ease }`。| `styles.css:4258`
- Modal 主体入场：`.modal { slideUp .15s var(--ease-out) }`（translateY 12→0，opacity 0→1，`.15s`）。
  Settings/Profile/Usage/Exam/Share 用 `.2s var(--ease-out)`；Workspace-dialog 用
  `.18s var(--ease-out) workspaceDialogIn`（translate 6px + scale .985 → 0 + scale 1）。
  | `styles.css:2210-2211, 2291, 588`
- ≤768px：去掉所有 overlay 的 `backdrop-filter`。| `styles.css:6354-6371`
- Thinking-panel sheet-in `.28s cubic-bezier(.22,1,.36,1)`（translateY 42→0 opacity .55→1）。| `styles.css:6342-6347`
- Thinking-panel 桌面 drawer-in `.24s cubic-bezier(.22,1,.36,1)`（translateX 30→0）。| `styles.css:6247-6252`
- Composer-tools 菜单 mobile 变 sheet：`composer-tools-sheet-in .32s cubic-bezier(.22,1,.36,1)`。
  | `styles.css:795, 823`

**Diff**:
- Scrim opacity：mobile `colors.scrim`（dark `rgba(0,0,0,.68)` / light `rgba(26,22,14,.45)`）；
  frontend `.55–.65 rgba(0,0,0)`。
- Modal 主体：mobile 走系统 fade/slide；frontend 每个 modal 都套 `slideUp .15–.20s var(--ease-out)`。
- Sheet 变体：mobile thinking-panel / composer-tools 都没有；frontend 有 `.28–.32s` 的 sheet-in。
- Backdrop blur：mobile 在 AppDrawer 用 `expo-blur` `intensity 18`；其它 overlay 不糊；frontend
  ≤768px 把所有 overlay 的 blur 关掉。

**修复**:
1. 在 mobile 建统一的 `<Overlay>` 组件，scrim fade `.15s`，body `slideUp .18s cubic-bezier(.16,1,.3,1)`。
2. ComposerToolsMenu / ModelPickerModal 切换成 sheet 变体（`.32s cubic-bezier(.22,1,.36,1)`）。
3. 在 `useWindowDimensions().width < 768` 时关掉 BlurView，匹配 frontend 的 perf override。

---

### 5.9 Navigation 切换 — 🟡 P2

**Mobile behavior**:
- Stack 走 `createNativeStackNavigator` `screenOptions: { animation: 'fade' }`，每个 push/pop 都是
  交叉淡（iOS ~ `.25s`，Android ~ `.18s`）。| `App.tsx:157`
- Tab 切换：不适用（无底 tab）。
- Drawer 打开：`<Modal animationType="fade">`（见 §5.8）。
- Back：硬件 `BackHandler`，先 dismiss 键盘，再关 drawer，再 `navigationRef.goBack()`。| `App.tsx:260-275`

**Frontend behavior**:
- 没有 JS 路由；顶栏 `#modeSegmentedTop` 切 `data-mode`，CSS 切样式，无 transition。
- Sidebar 收起：`.sidebar { transform: translateX(0); transition: transform .3s cubic-bezier(0.4,0,0.2,1), border-color .3s ... }`，`.sidebar.collapsed { transform: translateX(-100%) }`。| `styles.css:176, 178, 2984`
- Sidebar 内部 cross-fade：`.sidebar-inner { transition: opacity .25s var(--ease-out) }`，收起时
  `opacity:0; transition: opacity .1s var(--ease-out)`。| `styles.css:179, 196`
- 主区侧栏拖拽：`body.sidebar-resizing .main { transition: none !important }`，否则 padding-left
  跟 `--app-sidebar-width`。
- View transitions：`.3s ease-out vt-fade-out / vt-fade-in`。| `styles.css:39-40`

**Diff**:
- Stack push：mobile 用 native-stack 的 fade；frontend 整体没切页动画。
- Sidebar 收起：mobile 是 modal fade；frontend 是 `translateX` `.3s cubic-bezier(0.4,0,0.2,1)`。
- 时长：mobile 平台驱动；frontend `.3s ease-out` / `.3s cubic-bezier(0.4,0,0.2,1)`。

**修复**:
- 在 mobile 平台上不必复刻（无切页动画）；如果要让 AppDrawer 打开动画与 sidebar 收起一致，加
  Reanimated 的 `translateX` slide-in。

---

### 5.10 Composer auto-resize — 🔴 P0

**Mobile behavior**:
- `TextInput` 在"capsule"（单行 52px min-height）和 "expanded"（`minHeight:118`）两态之间切换。
- 触发：`isExpanded = focused || value.includes('\n') || value.length > 30`。| `Composer.tsx:111`
- 展开后 `minHeight:56, maxHeight:140`，字号 14 / line-height 20，`paddingHorizontal:8`。| `Composer.tsx:387-396`
- **没有 `onContentSizeChange`**，不增量增长；展开后高度钳在 56–140 之间。
- 单行 composer input：38px，行高 20。| `Composer.tsx:371-378`
- 两态切换**没有 transition**，瞬时切换。

**Frontend behavior**:
- `.rich-composer .tiptap { min-height:48px; max-height:180px }`；桌面 chat composer 是
  `min-height:calc(1.5em + 20px); max-height: var(--composer-editor-max)` (~280–320px)。
  | `styles.css:4857-4858, 4931`
- Topic composer：`min-height:86px; max-height:320px; padding:14px 18px; font-size:calc(16px * --app-font-scale); line-height:1.55`。
  | `styles.css:4862-4864`
- Tiptap `contenteditable` 自然撑高；超过 max-height 切 `overflow-y:auto`。
- Mobile 断点：`.rich-composer[data-surface="chat"]` `<769px` `min-height:44px; padding:10px 8px`。
  | `styles.css:4911-4935`
- Transition：
  - `transition: border-color var(--composer-motion-duration) var(--composer-motion-ease), box-shadow ..., background-color ...`，其中
    `--composer-motion-duration:.34s` `--composer-motion-ease:cubic-bezier(.22,1,.36,1)`。| `styles.css:1079, 1085, 2078, 4781`
  - Editor：`transition: min-height var(--composer-motion-duration) var(--composer-motion-ease), padding ...`。
    | `styles.css:4935`
  - 减弱-motion 下用 `.composer-anim-no-fr` 强制 `transition:none !important`。| `styles.css:5155`
- 聚焦边框：`.chat-input-wrap:focus-within { border-color: hsl(var(--accent-000)/.6) }`；桌面
  `.composer-focused { border-color: hsl(var(--accent-000)/.45) }`。| `styles.css:2102, 4953`

**Diff**:
- mobile 上限 `140px`；frontend 上限 ~280–320px。
- mobile 是二态瞬切；frontend 用 `.34s cubic-bezier(.22,1,.36,1)` glide border/shadow/height。
- mobile 不响应 `prefers-reduced-motion`。
- 高度：mobile 单行 wrap ~52px（input 38 + 圆按钮 38）；frontend 单行 ~60–70px。

**修复**:
1. 用 Reanimated 在 52px ↔ 118px 之间插值，`.34s cubic-bezier(.22,1,.36,1)`。
2. container `transition: border-color .34s cubic-bezier(.22,1,.36,1)`。
3. 增加 `prefersReducedMotion` hook，跳过动画。

---

### 5.11 Composer focus border — 🔴 P0

**Mobile behavior**:
- container border 内联：`borderColor: focused ? withAlpha(colors.accent, 0.45) : withAlpha(colors.border, 0.24)`。
  | `Composer.tsx:140-145`
- `withAlpha` 在 `mobile/src/theme/theme.ts`。
- border 切换**没有 transition**。

**Frontend behavior**:
- `.topic-input-wrap:focus-within { border-color: hsl(var(--accent-000)/0.5) }`。| `styles.css:1087`
- `.chat-input-wrap:focus-within { border-color: hsl(var(--accent-000)/.6) }`。| `styles.css:2102`
- `.chat-input-wrap.composer-focused { border-color: hsl(var(--accent-000)/.45) }`。| `styles.css:4953`
- transition：`.34s cubic-bezier(.22,1,.36,1)`。

**Diff**:
- 颜色：mobile `accent @ 0.45`；frontend `.chat-input-wrap:focus-within` `accent @ .6`，`.composer-focused` `accent @ .45`。
- 动画：mobile 0ms；frontend `.34s`。

**修复**:
- 给 container border 加 `transition: border-color .34s cubic-bezier(.22,1,.36,1)`。

---

### 5.12 IME / keyboard handling — 🔴 P1

**Mobile behavior**:
- `<KeyboardAvoidingView>` 包住需要键盘的屏，`behavior = Platform.OS === 'ios' ? 'padding' : 'height'`。
  | `Screen.tsx:8-12`, `AuthScreen.tsx:262`
- NewChatScreen / ChatScreen 用 `<Screen keyboard>`，RN 自动 padding。
- CmdKPalette 自己用 `KeyboardAvoidingViewWrapper`：监听 `keyboardDidShow/Hide`，存 height，用
  `paddingBottom: offset` 撑起面板。| `CmdKPalette.tsx:82-97, 395-407`

**Frontend behavior**:
- `ui/keyboard/index.ts` 测 `appBottom - (visualViewport.offsetTop + visualViewport.height)`，写 `--keyboard-inset`。
  抬起动画 `KEYBOARD_LIFT_MS = 220`，`easeKeyboardLift(t) = 1 - (1-t)^3`（ease-out cubic）。
  | `ui/keyboard/index.ts:54, 57-60, 209-220`
- composer / msg-list 在 inset 改变后重新锚定（`smooth:false`）。
- `data-keyboard-open` 切换：`roundedTarget > 50 ? 'true' : 'false'`。| `ui/keyboard/index.ts:228`
- 减弱-motion 时直接 snap。| `ui/keyboard/index.ts:237`

**Diff**:
- mobile 走 RN `KeyboardAvoidingView`（iOS 平台 slide-up，Android windowSoftInputMode）；
  frontend 自己握 220ms ease-out cubic。
- mobile 不插值 focus 高度；frontend 用 `.34s cubic-bezier(.22,1,.36,1)`。

**修复**:
- 监听 `Keyboard.addListener('keyboardDidShow', ...)`，把 wrap 的 `translateY` 用 Reanimated 抬起，
  220ms ease-out cubic（`Easing.bezier(.33, 1, .68, 1)` 或 `Easing.out(Easing.cubic)`）。

---

### 5.13 发送按钮 enable / disable — 🔴 P0

**Mobile behavior**:
- `colors.accent` ↔ `colors.surfaceHover`，`canSend = (value.trim().length > 0 || hasAttachments) && !disabled`。
  | `Composer.tsx:108, 196-216, 292-315`
- 流中（`disabled === true`）切到 Stop 按钮（accent 填充 + stop glyph 14px）。| `Composer.tsx:196-203`
- 图标尺寸：arrow-up 16px。| `Composer.tsx:214`
- 没有单独的 press 缩放；wrap `AnimatedPressable` 给 `.975`。

**Frontend behavior**:
- `.send-btn { 28×28; border-radius:50%; background: hsl(var(--bg-300)); color: hsl(var(--text-400)); transition: bg .28s var(--ease-out), color .28s, box-shadow .28s, transform .18s }`。
  | `styles.css:2140`
- `:active { scale(.88) }`。| `styles.css:2143`
- `:hover { background: hsl(var(--bg-400)); color: hsl(var(--text-200)); svg translateY(-1px) }`。
  | `styles.css:2142, 2145`
- `.send-btn.active { background: hsl(var(--accent-000)); color: hsl(var(--oncolor-100)); box-shadow: 0 2px 10px hsl(var(--accent-000)/0.22), 0 4px 18px hsl(var(--accent-000)/0.12); transform: scale(1.05) }`。
  | `styles.css:2146`
- 减弱-motion 下 `.send-btn.active { transform:none !important }`。| `styles.css:5146`
- 移动端断点 30×30。| `styles.css:4792, 4910`
- `.send-btn.chat-stop { background: hsl(var(--bg-300)); color: hsl(var(--text-000)) }`（中性填充 + 深文字）。
  | `styles.css:2155`

**Diff**:
- 尺寸：mobile 28×28 一致。
- mobile active **不放大**到 `1.05`；只有 `.975` press scale。
- mobile idle 用 `colors.surfaceHover`（≈ `--bg-300`）；frontend 直接 `hsl(var(--bg-300))`。
- mobile active **没有 box-shadow**；frontend 有 `0 2px 10px accent/.22 + 0 4px 18px accent/.12`。
- mobile 没有 hover translateY。
- Stop 变体：mobile 是 accent 填充 + 白 stop 字形；frontend 中性 `bg-300` + 深文字。

**修复**:
1. canSend 时 `transform: scale(1.05)` + `box-shadow` 阴影。
2. bg/color 加 `.28s var(--ease-out)` transition。
3. Stop 切到 `colors.surfaceHover` + 深 stop 字形。

---

### 5.14 Scroll-to-bottom pill — 🔴 P0

**Mobile behavior**:
- 触发：`showScrollBottom === true`（`onScroll` 距底 `> 96px` 且内容比视口高 `> 200px`）。| `ChatScreen.tsx:108-119`
- 位置：`right:10; bottom: scrollBottomOffset`，`scrollBottomOffset = 96 + max(insets.bottom, 0) + 12`。
  | `ChatScreen.tsx:55, 452-470`
- 样式：`colors.surfaceRaised` 背景、`colors.border` 边框、padding 10/4、minHeight 26、radius 13、
  无 borderWidth、elevation 4、shadow 0 4 7 op .25。
- 没有"intent-releases pin"逻辑，仅 `showScrollBottom` toggle。| `ChatScreen.tsx:112`
- 跳到底：`listRef.current?.scrollToEnd({ animated:true })`。| `ChatScreen.tsx:115-119`
- 平滑滚动：FlatList 默认（iOS `.3s ease-in-out`，Android `LinearOutSlowIn`），没有自定义曲线。

**Frontend behavior**:
- 位置：`right:20px; bottom: calc(96px + env(safe-area-inset-bottom, 0px) + var(--keyboard-inset, 0px) + 16px)`。
  | `styles.css:985-994`
- 样式：`.new-reply-pill { padding:6px 12px; border-radius:999px; background: hsl(var(--bg-000)); border: 0.5px hsl(var(--border-300)/0.35); color: hsl(var(--text-200)); font-size:12px; font-weight:500; box-shadow: 0 4px 14px ...; opacity:0; transform: translateY(8px) scale(.96); pointer-events:none; transition: opacity .22s cubic-bezier(.4,0,0.2,1), transform .26s cubic-bezier(.16,1,.3,1), bottom .3s var(--ease-out), box-shadow .2s, filter .2s }`。
  | `styles.css:1012`
- `.new-reply-pill.visible { opacity:1; transform: translateY(0) scale(1); pointer-events:auto }`。| `styles.css:1015-1018`
- `:hover { filter:brightness(1.08); transform: translateY(-2px); box-shadow: 0 6px 20px }`。| `styles.css:1020`
- `:active { transform: translateY(0) scale(.96) }`。| `styles.css:1021`
- `:focus-visible { outline: 2px solid hsl(var(--accent-200)); outline-offset: 2px }`。| `styles.css:1022`
- `scrollPill.js`：阈值 `SCROLL_SLACK = 64`；wheel/touch/keyboard intent 立即置 `_userScrolledAway`；
  scroll 监听（capture phase）只在真实移动 `> 12px` 时标记。| `scrollPill.js:14, 58-129`
- `smoothScrollToBottom`：速度规划 `MOTION_VELOCITY_PX_PER_S = 1800`、`MOTION_SNAP_DISTANCE_PX = 24`、
  `MOTION_MIN/MAX_DURATION_MS = 90/520`，缓动 `cubic-bezier(.22,1,.36,1)`，ease-out quint。
  | `motion.js:47-50`

**Diff**:
- 位置：mobile `right:10` vs frontend `right:20`。
- padding：mobile `10/4` vs frontend `6/12`。
- 高度：mobile minHeight 26 vs frontend 自然 ~24。
- 半径：mobile 13 vs frontend 999（全 pill）。
- 阈值：mobile `BOTTOM_TOLERANCE = 96` vs frontend `SCROLL_SLACK = 64`。
- 额外门槛：mobile 要求内容 > 视口 + 200；frontend 仅看"是否距底"。
- 入场动画：mobile 无；frontend `.22s/.26s` 双曲线。
- 底部 offset：mobile +12；frontend +16 并加 `--keyboard-inset`。
- 平滑滚动：mobile 平台默认；frontend 速度规划 90–520ms `cubic-bezier(.22,1,.36,1)`。

**修复**:
1. `BOTTOM_TOLERANCE` 64；去掉 `+ 200` 门槛。
2. Reanimated 驱动 pill `opacity` + `translateY`（`.22s cubic-bezier(.4,0,0.2,1)` 入、`.26s cubic-bezier(.16,1,.3,1)` 出）。
3. 底部 offset 加键盘插入高度。
4. 跳到底用速度规划器（`distance / 1800` ms，clamp 90–520，ease-out quint）。

---

### 5.15 Sticky / pinned scroll — 🟡 P1

**Mobile behavior**:
- `stickToBottom` ref；`onContentSizeChange` 调用 `scrollToLatest(false)` 保持钉底。| `ChatScreen.tsx:97-106`
- `scrollToLatest` 用 `setTimeout(..., 0)` 折叠同帧多次 scroll。| `ChatScreen.tsx:97-104`
- `BOTTOM_TOLERANCE = 96`。| `ChatScreen.tsx:38`

**Frontend behavior**:
- `SCROLL_SLACK = 64`。| `scrollPill.js:14`
- `isPinnedToBottom()` / `shouldAutoScroll()`（`scrollDecision.ts`）。
- `scrollToBottomIfPinned()` snap（无动画）当内容增长且钉底。| `scroll.js:118-128`
- `velocityScrollTo` 用于 send + 键盘抬起：`distance / 1800` ms clamp 90–520，缓动
  `cubic-bezier(.22,1,.36,1)`。| `motion.js:67-72, 121-148`

**Diff**:
- Slack：mobile 96 vs frontend 64。
- 速度规划：mobile 无。

**修复**:
- Slack 改 64。速度规划可后续做（UX 改进，非破坏 1:1）。

---

### 5.16 Sidebar drag — 🔴 P0（mobile 完全缺失）

**Mobile behavior**:
- **没有 swipe 手势**。AppDrawer 只能点汉堡按钮打开，点关闭按钮或 backdrop 关。| `AppDrawer.tsx:149-163`
- 宽屏（`sidebarWidth !== null`，`useResponsive`）时 `permanent` 模式；否则 modal overlay `fade`。
  | `AppDrawer.tsx:133-148`
- 宽屏宽度 `sidebarWidth ?? 288`，maxWidth 288。| `AppDrawer.tsx:292, 518`

**Frontend behavior**:
- 侧栏拖拽：`initSidebarDrag()` 监听 `.sidebar-resize-handle`（10px 右沿）。范围 `200–480` 默认 `276`。
  鼠标 + 触摸 + 键盘。| `sidebarResize.js:11-105`
- 拖拽中：`body.sidebar-resizing .sidebar { will-change:width; transition:none !important }`，直接
  1:1 写 `--app-sidebar-width`。| `styles.css:177`
- 收起/展开 transition：`transform .3s cubic-bezier(0.4,0,0.2,1), border-color .3s ...`。
  | `styles.css:176`
- Inner cross-fade：`.sidebar-inner { opacity:1; transition:opacity .25s var(--ease-out) }`；收起时
  `opacity:0; transition:opacity .1s var(--ease-out)`。| `styles.css:179, 196`
- ≤769px：sidebar overlay（`position:fixed`）`transform translateX(0)` ↔ `translateX(-100%)`，
  transition `.3s cubic-bezier(0.4,0,0.2,1), box-shadow .3s ...`。| `styles.css:2984`
- Backdrop tap：`.sidebar-backdrop { fadeIn .15s }`。| `styles.css:2985`

**Diff**:
- 拖拽：mobile 完全不支持。
- Slide-in：mobile modal fade；frontend `translateX(0↔-100%)` `.3s cubic-bezier(0.4,0,0.2,1)`。
- Backdrop：mobile `rgba(0,0,0,0.64)` (AppDrawer.tsx:516)，frontend `rgba(0,0,0,0.7)` 移动端或不画桌面。
- Backdrop 动画：mobile 平台驱动；frontend `.15s ease fadeIn`。
- 宽屏挂载：mobile flex inline 渲染；frontend `<aside class="sidebar">` + `width: var(--app-sidebar-width, 18rem)` absolute。

**修复**:
1. 用 `react-native-gesture-handler` 加"从左边缘 swipe-in"手势。
2. Reanimated 驱动 `translateX` slide-in，替换 `animationType="fade"`。
3. backdrop 同步 `.15s ease` fade。

---

### 5.17 Pull-to-refresh / Swipe-to-dismiss — ✅ / 🟡 P2

**Mobile behavior**: 没接 `<RefreshControl>`；modal 没 swipe-to-dismiss。

**Frontend behavior**: 也不支持（web-only，没有下拉刷新 / 滑动关闭的范式）。

**修复**: 无需对齐（两边都不做）。

---

### 5.18 Animation timing curves（统一缓动）— 🔴 P0

**Mobile behavior**:
- 几乎所有动画用 `Animated.spring`（`damping:18, stiffness:260, mass:0.7`）或没有。
  | `AnimatedPressable.tsx:14`
- 没有 canonical ease 曲线。
- 没监听 `prefers-reduced-motion`。

**Frontend behavior**:
- 主源：`--ease-out: cubic-bezier(0.16,1,0.3,1)` `--ease-spring: cubic-bezier(0.34,1.3,0.64,1)`。
  | `styles.css:29-30`
- 主流缓动：`cubic-bezier(.22,1,.36,1)`（`motion.js` + composer vars）。| `motion.js:51, 1079`
- 其它：
  - `cubic-bezier(.4,0,.2,1)` 标准 ease-in-out。| `styles.css:176, 870, 886, 1012, 1217, 1321, 4695, 5111`
  - `cubic-bezier(.16,1,.3,1)` menu reveals。| `styles.css:1120, 1325, 1329`
  - `cubic-bezier(.65,0,.35,1)` loading spinner。| `styles.css:2163`
  - `cubic-bezier(.4,0,.2,1)` tool-inline spin。| `styles.css:4491`
  - `cubic-bezier(.45,.05,.55,.95)` tool-inline spin alt。| `styles.css:4481`
- 速度规划：`MOTION_VELOCITY_PX_PER_S = 1800`，`MOTION_MIN/MAX_DURATION_MS = 90/520`，
  `MOTION_SNAP_DISTANCE_PX = 24`。| `motion.js:47-50`
- `KEYBOARD_LIFT_MS = 220`。| `ui/keyboard/index.ts:54`

**Diff**:
- mobile 没有 canonical curve；frontend 5+ 种已被命名。

**修复**:
1. 在 `mobile/src/ui/motion.ts` 暴露 `Easing.bezier(.22, 1, .36, 1)` 等。
2. `AnimatedPressable` 等使用 `cubic-bezier(.16,1,.3,1)`，对齐 `--ease-out`。
3. 加 `prefersReducedMotion()` helper。

---

### 5.19 Reasoning / streaming 文本样式 — 🔴 P0

**Mobile behavior**:
- `MessageBubble` 可折叠卡。背景 `colors.reasoningBg`，border `colors.border`，radius `radius.md`。
  | `MessageBubble.tsx:127`
- Header：`sync-outline` 流中 / `bulb-outline` 结束，14px `colors.accent`，label `colors.accent`，
  `typography.medium`，12px。chevron 16px `colors.textMuted`。| `MessageBubble.tsx:130-156`
- Body：`colors.reasoningFg`，12px / line-height 18，padding-left 8 加 2px `colors.accent` 左 border。
  | `MessageBubble.tsx:149-156, 274-283`
- 收尾时若推理 `> 200` 字符自动折叠。| `MessageBubble.tsx:64-68`

**Frontend behavior**:
- 统一 `.thinking-spinner`（12–14px 圆环 + 子 dot 脉动）。12/14px 圆环 `ringSpin .9s cubic-bezier(.4,0,.2,1) infinite`；
  内部 dot `thinkingDotPulse 1.8s ease-in-out infinite`。| `styles.css:3346-3372`
- `.thinking-status` 自身：gap 8 / color text-300 / font 13px / padding 4 6 / radius 7 / `transition: color .15s ease, bg .15s ease`。| `styles.css:3320`
- 推理面板单独（`.thinking-panel`）—— 点击思考药丸后打开，桌面右侧抽屉、手机底部 sheet，
  各自有 slide-in 动画。| `styles.css:6235-6348`
- 流中文字 shimmer：`.shimmer-text` 跑 `neutralTextWave 3.2s linear infinite`。| `styles.css:3377-3399`

**Diff**:
- mobile 是静态 `sync-outline`；frontend 是自转 ring + dot 脉动。
- mobile 永远 inline；frontend 拆为 waiting / in-progress / done，plus 点击打开抽屉。
- mobile label 用 `colors.accent`；frontend 用 text-300。
- mobile body 12/18；frontend 13/1.7。
- mobile body 有 2px accent 左 border；frontend 没有。
- mobile 没有 `.shimmer-text`。
- mobile reasoning 卡没有 hover/active 样式。

**修复**:
1. `sync-outline` 换成 Reanimated 自转 ring，仿 `.thinking-spinner`。
2. 去掉 2px accent 左 border；或前端补一个对应样式。
3. 在流中文本上加 `neutralTextWave` shimmer。

---

### 5.20 Composer Tools Menu — 🔴 P0

**Mobile behavior**:
- `<Modal transparent animationType="fade">`，底部 card（radius 20，232×variable）。`paddingBottom:76`
  让出 composer。| `ComposerToolsMenu.tsx:95-186`
- 项：38px 圆形图标井（`colors.surfacePressed`）+ 14px 标签 + 可选 checkmark。| `:112-156, 194-205`
- Press：`AnimatedPressable`（`.975`）；action 延迟 100ms 再跑。
- card：`colors.surface` (overlay) border，elevation 12，shadow 8/.35/24。

**Frontend behavior**:
- `composer-tools-menu` 是 body-portal popover（`composerTools.js:position()`），
  `composer-tools-enter .22s var(--ease-out)` 入（scale `.985 → 1`，translateY `7 → 0`）。| `styles.css:709-779`
- ≤768px 切 bottom-sheet：`border-radius:20px 20px 0 0; animation: composer-tools-sheet-in .32s cubic-bezier(.22,1,.36,1)`。| `styles.css:5559-5603`
- Scrim：`body.composer-tools-open::after { content:''; position:fixed; inset:0; background:rgba(0,0,0,.4); z-index:849; animation: composer-tools-scrim-in .25s ease }`。| `styles.css:817-824`
- 项：`.composer-tools-item` flex row gap 10 padding 9/10 radius 8，hover `color: text-100`，active `scale(.985)`。
  | `styles.css:805-812, 743-748`
- 图标容器：`.composer-tools-icon` 16–20px accent。

**Diff**:
- 容器：mobile 是 Modal + 底部固定 232px 宽 card；frontend 是 portal popover（贴近 trigger）
  或 bottom-sheet（≤768px），宽 `min(340px, calc(100vw - 24px))`。
- 动画：mobile 只 fade；frontend `.22s var(--ease-out)` 或 sheet-in `.32s cubic-bezier(.22,1,.36,1)`。
- Scrim：mobile `colors.scrim` 不 fade；frontend `.25s ease` 淡入。
- Press scale：mobile `.975`；frontend `.985`。
- Action delay：mobile `setTimeout(..., 100)`；frontend 立即。
- 图标井：mobile 38×38；frontend 16–20px square。

**修复**:
1. `animationType="fade"` 换成 Reanimated slide-up（translateY 28→0、`.32s cubic-bezier(.22,1,.36,1)`）。
2. 去掉 100ms action delay。

---

### 5.21 Confirm Dialog — 🟡 P1

**Mobile behavior**:
- 视觉与 frontend 一致（radius 14，maxWidth 320，padding 24/20/16，danger/cancel 按钮）。
- 入场只有 `animationType="fade"`。

**Frontend behavior**:
- `.confirm-box { animation: slideUp .15s var(--ease-out) }`。| `styles.css:2289-2291`
- `.confirm-btn.danger` 用 `hsl(0 60% 15%)` 背景 / `hsl(0 60% 55%)` 颜色；mobile 用
  `colors.dangerSoft` / `colors.danger`。

**Diff**:
- 入场：mobile fade；frontend `.15s var(--ease-out)` slide-up。
- 时长：mobile 系统 `.25s`；frontend `.15s`。

**修复**:
- 用 `Animated.View` 把 confirm body 包起来，slide-up `.15s var(--ease-out)`。

---

### 5.22 Side-panel drawer（AppDrawer slide）vs sidebar

见 §5.16。mobile AppDrawer 是 modal fade；frontend sidebar 是 `transform: translateX(0 ↔ -100%)` `.3s cubic-bezier(0.4,0,0.2,1)`。要全对齐：
- AppDrawer panel 用 Reanimated `translateX` 滑动。
- backdrop 同步 `.3s` 透明度过渡。
- `BlurView` 在 ≤768px 时关掉，匹配 frontend perf override。

---

## TL;DR 表格

| State | Mobile issue | Frontend target | Severity |
| --- | --- | --- | --- |
| Press scale | Uniform `0.975` (`AnimatedPressable.tsx:12`) | Per-instance `.88–.99` (`styles.css:2143`) | P1 |
| Press easing | Spring (`AnimatedPressable.tsx:14`) | CSS transition `.12-.18s cubic-bezier(.4,0,.2,1)` | P1 |
| Focus ring | None | 1.5-2px accent outline 1-2px offset (`styles.css:121, 5067`) | P0 |
| Disabled | Native, no opacity | `.3-.6` opacity + `cursor:not-allowed` (`styles.css:3434, 2237, 3050`) | P0 |
| Spinner curve | Platform default | `loadingSpin 1.2s cubic-bezier(.65,0,.35,1)` (`styles.css:2163`) | P1 |
| Skeleton | None | `.shimmer` 2s sweep (`styles.css:2192-2197`) | P0 |
| Empty landing animation | None | `emptyStateIn .4s var(--ease-out)` staggered (`styles.css:1074-1086`) | P1 |
| Toast/Snackbar | None (uses `Alert.alert`) | `.alert-container` `.alertSlideIn .3s var(--ease-out)` (`styles.css:1928-1958`) | P0 |
| Composer focus border | Instant (`Composer.tsx:140`) | `.34s cubic-bezier(.22,1,.36,1)` (`styles.css:2078`) | P0 |
| Send button idle | `colors.surfaceHover` | `bg-300` + `text-400` (`styles.css:2140`) | P2 |
| Send button active | Accent fill, no shadow | Accent + box-shadow + scale(1.05) (`styles.css:2146`) | P0 |
| Send button stop | Accent fill (`Composer.tsx:298`) | `bg-300` + `text-000` (`.send-btn.chat-stop` `styles.css:2155`) | P1 |
| Pill placement | `right:10` | `right:20` (`styles.css:985`) | P2 |
| Pill animation | None (instant toggles) | `.22s cubic-bezier(.4,0,0.2,1)` + `.26s cubic-bezier(.16,1,.3,1)` (`styles.css:1012`) | P0 |
| Pill threshold | 96px slack + 200px gate | 64px slack, no gate (`scrollPill.js:14`) | P0 |
| Sidebar slide | Modal fade | `transform .3s cubic-bezier(0.4,0,0.2,1)` (`styles.css:176`) | P0 |
| Composer tools sheet | Modal fade | `.32s cubic-bezier(.22,1,.36,1)` sheet-in (`styles.css:795`) | P0 |
| Confirm dialog | Modal fade | `slideUp .15s var(--ease-out)` (`styles.css:2291`) | P1 |
| Reasoning indicator | Static `Ionicons sync-outline` (`MessageBubble.tsx:134`) | 12-14px ring + `ringSpin .9s` (`styles.css:3359`) | P0 |
| Canonical easing | None | `--ease-out: cubic-bezier(.16,1,.3,1)` (`styles.css:29`) | P0 |
| Velocity planner | None | `1800 px/s`, `90–520ms` clamp (`motion.js:47-50`) | P2 |
| Reduced-motion | No listener | `prefersReducedMotion()` snaps (`motion.js:77-85`) | P1 |
| Keyboard lift easing | RN default | `220ms easeKeyboardLift` ease-out cubic (`ui/keyboard/index.ts:54-60`) | P1 |

---

_(§5 由 subagent `ses_f9959fd92ffesH6NpS96o8Fwd3` 生成，主 agent 转中文落盘。)_

---

## 对齐日志

### Batch E（2026-09-03，Share route→modal，已验证）
- 新建 `ShareModal.tsx`：payload store（`shareModal.open/close`）+ 居中 modal（`90% maxWidth:400 padding:24/20/20 radius:16`，`slideUp .2s ease-out`，对 `.share-modal :2605`）+ header/close + 可选链接 + Copy（accent，写剪贴板后 toast）+ 原生 Share（中性）+ `ShareModal.test.tsx`（挂载/卸载渲染测试）。
- 唯一调用点 `ChatScreen.onShare` 改走 `shareModal.open`；删 `ShareScreen.tsx`、路由注册、`RootStackParamList.Share`、`WorkspaceScreen` Exclude；`App.tsx` 挂载 `<ShareModal />`；i18n 加 `share.title/copy/copied`（中英）。
- Defer：visibility 三档 + revoke（`sharesApi` 只有 create/get，需后端）；status/error 行内态（copy 成功走 toast，失败面待补）。
- 过程记录：jest 曾把 `ShareModal.test.ts`（旧弱断言）与 `.tsx` 当两个套件跑，一挂一过——删旧文件后 8/8 全过。
- 验证：typecheck 仅剩预存 `MarkdownView.tsx:193` 错误；`jest src/components src/i18n` 8 套件 23 测试全过。

### Batch D（2026-09-03，交互动效批，已验证，无新依赖）
- `ComposerToolsMenu.tsx`：去掉 100ms action 延迟，立即执行（frontend 无预滚）。
- `AnimatedPressable.tsx`：新增 `restingScale`（默认 1，零行为变更）；press spring 在 `restingScale ↔ scale` 之间跑，resting/active scale 得以叠加而非覆盖。
- `Composer.tsx`：发送键 press `.975→.92`（对 `.send-btn:active .88` / `.active:active .92`）+ `restingScale 1.05` + accent glow（对 `.send-btn.active`）；停止键改中性（`sendIdleBg/Fg`，对 `.send-btn.chat-stop`）。RN 无 CSS transition，切换瞬时——残留。
- `MessageBubble.tsx`：流中 `sync-outline` 改 900ms 线性自转（对 `ringSpin .9s`），结束回 `bulb-outline`。
- `NewChatScreen.tsx`：landing 加 `Enter`（`.4s cubic-bezier(.16,1,.3,1)`，`emptyStateIn` 同款），greeting 0ms / ideas 70ms / composer 140ms 错峰。
- `ConfirmDialog.tsx`：box 加 `slideUp .15s ease-out`（12px→0，对 `:2291`），`visible` 每次打开重播。
- 验证：typecheck 仅剩预存 `MarkdownView.tsx:193` 错误；`jest src/components src/i18n` 7 套件 22 测试全过。

### Batch C（2026-09-03，focus ring + Skeleton + Toast，一次性完成，已验证）
- `AnimatedPressable.tsx`：加 `focusRing`（默认开）+ `onFocus/onBlur` 包裹；聚焦时叠 `outline 2px accent/.85 offset 2px`（对 `styles.css:121`），disabled 时不画。`useTheme` 无 Provider 时回退 dark，裸渲染测试不受影响；outline 键在 native 驱动被忽略，不影响触屏布局。
- `Skeleton.tsx`（新）：`colors.surface`（=`bg-200`）底 + radius 6 + 2s 透明度脉冲（对 `.shimmer` 2s sweep 的 RN 近似，无 gradient 原语）+ `Skeleton.test.tsx`。
- `Toast.tsx`（新）：`toast.show/dismiss` 单槽 store（时长 2.5–5s 随文案长度，`0` 常驻）+ `ToastHost`（底部居中 safe-area，四色，`.3s cubic-bezier(.16,1,.3,1)` 入、`.2s` 出，对 `.alert-container/.alert-item` + `alertSlideIn .3s var(--ease-out)`）+ `Toast.test.ts`（store 三测）。已挂载到 `App.tsx`（`CmdKPalette` 旁，providers 内）。
- 采用：`RecentsScreen` busy 态改 5 行 skeleton（对位行布局）+ 预览失败 `Alert`→toast error；`SettingsScreen` 三处结果 `Alert`→toast error（profile/memory/forget）。Action sheets（`AppDrawer:203`、`Recents:99-108`）保留原生——toast 只替瞬时通知，不替多按钮确认，这是移动端正确习语。
- 验证：typecheck 仅剩预存 `MarkdownView.tsx:193` 错误；`jest src/components src/i18n` 7 套件 22 测试全过。测试中学到：`findByProps(testID)` 命中外层函数节点，断言需取内层带 style 数组的节点；flatten 含 Animated 值的数组会拖垮 serializer，改对数组条目断言。

### Batch B（2026-09-03，ToolCard chrome + Mistakes 卡视觉，已验证）
- `ToolCard.tsx`：容器去边框去填充（对 `.agent-tool-card{background:transparent;border:0}` `:3845-3847`），radius→14（`--tool-card-radius` `:62`）；head 加 `minHeight:30`；名字 mono 12/700→sans 13/500（`typography.medium`，对 `.agent-tool-name` `:3872`）；status 10→11；args mono 11→sans 12；meta 10→11；输出体 padding 8/7→11/9、radius→11（`--tool-card-radius-sm`）；structured/visual radius→14；source 行 padding→12/10、radius→8（对 `.storage-row` `:437`）；artifact 行 `paddingHorizontal`→12、radius→8；visual kicker accent→`textSubtle`（对 `.agent-tool-section-head`）。移除 5 处已无引用的 `radius` 解构。
- `MistakesScreen.tsx`：行改危险 tint 卡（`dangerSoft` 底 + danger 40% hairline + 左 3px danger + radius 10 + padding 10/12 + margin 0 4 8，对 `.mistake-card`）；题干 15/21 semibold→12/18 regular（对 `.mistake-q`）；filter 加 `all`（API `resolved=undefined` 即全量，`client.ts:238` 原生支持）+ i18n `mistakes.all`（All/全部）。
- 验证：typecheck 仅剩预存 `MarkdownView.tsx:193` 错误；`jest src/components src/i18n` 5 套件 17 测试全过。
- Defer（需数据/行为支持）：选项原文 + correct/wrong tag（contract `Mistake` 无 options 字段）；Redo 按钮（需 quiz 挂载流）；type pill（无 type 数据）；marker 圆盘保留（frontend 是 pill，无数据不硬转）。

### Batch A（2026-09-03，mobile 数值对齐，已验证）
- `MessageBubble.tsx`：user bubble `borderRadius 20→24`（对 `styles.css:1881`）；assistant `paddingHorizontal/Vertical → 0`（frontend 无 padding）；附件行 `radius 8→14`、`paddingVertical 6→3`、`maxWidth 240→200`（对 `:1885`）；图片 `radius 6→10`（对 `:2888`）。另移除已无引用的 `spacing` 解构。
- `ChatScreen.tsx`：`BOTTOM_TOLERANCE 96→64`（对 `SCROLL_SLACK=64`）；去掉 `+200` 内容高度门槛（frontend 仅看距底）。
- `AnimatedPressable.tsx`：`disabled` 时跳过 spring（对 frontend `:not(:disabled)`）；新增 `disabledOpacity`（默认 1，零视觉变更，按需传入）。
- `UsageOverlay.tsx`：`maxWidth min(480,…)→min(720,…)`（对 `.usage-modal min(720px,94vw)` `:2311`）。
- 验证：`mobile npm run typecheck` 仅剩一处预存错误（`MarkdownView.tsx:193`，与本批文件无关，改前已存在）；`npx jest src/components` 4 套件 9 测试全过。

### Audit 误报修正（经 `styles.css` 实测，不修）
1. Composer focus 边框：mobile `accent @ .45` **正确**——frontend 有两条规则（`:2102` `.6` 与 `:4783` `.45`），后者同特异度靠后胜出。§2/§5.11 的"改 .6"作废。
2. Pill `right:10`：mobile **正确**——对应的是 frontend ≤768px 断点规则（`:4346,4349` `right:10px`），`right:20` 是桌面规则。§5.14 的"改 20"作废。
3. Attach 38px：mobile **正确**——composer footer 上下文 frontend 即 38px（`:4795,4999,7265`），28px 只是裸 `.attach-btn`（`:2111`）。§2 的"改 28"作废。
4. Composer `maxWidth`（620 vs 928）：**已随 2026-09-18 批解决**——displayPrefs `BASE_CONTENT_WIDTH` 由 928 改为 768（48rem，对 `--conversation-content-width`），Composer 现在以内联 `maxWidth: contentWidth` 读取 live pref，`maxWidth:620` 降为 fallback。§2/§4.8 的相关描述已过时。

### Batch F（2026-09-18，多 agent 并行 parity 收尾，文档回写时 typecheck 仅剩 8 条预存错误）
已落地（本节取代上文 §1–§5 对应条目的"缺失"描述）：

- **scroll dead-zone**：`RichBlock` 外层 `pointerEvents="none"`，消息列表内 WebView（公式/图表）不再吃掉滚动手势；Expand overlay 用 `interactive` 打开触摸（`RichBlock.tsx`）。`CanvasBlock` 原片预览仅在内容超过 480px cap 时才启用 inner scroll（`scrollEnabled={originalOverflows}`）。
- **store selectors**：`useAppStore(selector)` 带 selector memoisation（内联 `useSyncExternalStoreWithSelector` 模式，`appStore.ts` 末尾）；`App.tsx`、`AppDrawer`、`StorageOverlay` 改按字段订阅。流式 patch 批处理 32→64ms，rawText delta 先攒 chunk buffer 再 join（去 O(n²) 拼接），draft 写 SQLite 改 400ms trailing debounce + 各切会话路径 `flushDraftSave`。
- **hardcoded colors → tokens**：`MistakesScreen`（danger/success badge、optionRow、letterBadge 全走 `withAlpha(colors.*)`）、`Composer` context chips（`#064d9e/#9bcbff` → `accentSoft/accent`）、`AppDrawer` backdrop（`rgba(0,0,0,.64)` → `withAlpha(colors.black,.65)`）、`KnowledgeScreen` scrim+sheetHandle、`ProjectsScreen` 默认色、`WebAppScreen`、`RecentsScreen` hairline、`ErrorBoundary`（`import { colors }` → `palettes.dark`，该旧导出已删除）。
- **scrim tiers**：`theme.ts` 新增 `scrimModal(.55)` / `scrimConfirm(.65)` / `scrimDrawer(.7)`，`scrim` 现为 `.55` 别名；`ConfirmDialog` 传 `scrimColor={colors.scrimConfirm}`，`CmdKPalette`/`SettingsScreen`/`DisplaySettingsScreen` 走 `scrimModal`。§4.1 的 `scrim` 无 web 等价描述已过时。
- **motionEasing**：`theme.ts` 导出 `motionEasing = { out: bezier(.16,1,.3,1), spring: bezier(.34,1.3,.64,1) }`；`AnimatedPressable` press 由 spring 改 180ms timing（对 web CSS transition），`AppDrawer` slide、`MessageBubble` thinking panel、`SettingsScreen` toggle 全部接入。§4.7/§5.18 的"从未 import"已解决。
- **AttachmentChip**（新组件 `src/components/AttachmentChip.tsx` + test）：`.attachment-chip` 端口——28px 圆形 icon well、按 kind/mime/extension 分派 `attachmentIconName`（office/pdf/image/media/text/code）、`truncated` 标注、可选 remove、`pending`/`progress`/`error` 态。`Composer` 新增 `attachments`/`onRemoveAttachment` props 渲染 `.attachment-chips` 条（NewChatScreen 已接入）；`MessageBubble` 非图片附件改走 chip（`.msg-attachment-chips`，置于 bubble 上方、user 右对齐）。
- **msg toolbar/bubble**：user bubble 15px radius、11×16 padding、`colors.userBubble` 填充、`min(86%,620px)` 上限、编辑态 20px；toolbar 非末条 assistant 0.7 opacity、attachment-only 消息也出 toolbar、speaking 态 accent 填充 + speakPulse。§1.2/§2 MessageBubble 条目部分解决（字号 fontScale 已由 `fontScale` 在 MarkdownView 接入，`.msg-body` 仍 15/24 裸值）。
- **code block headers**：`MarkdownView` 新增 `CodeBlock`——28px header（lang label + Copy→Copied）、radius 卡、12px mono、水平滚动；inline code 改真 padding/radius 替代空格 hack，字号走 `fontScale`。
- **session meta（Recents）**：行级 meta `formatRelativeTime(updatedAt) · N Qs`、session mode 圆点（`modeDotColor`/`modeDotLabel`）、filter chips、time-group header、empty 态 `emptyAction`（返回 All / Retry）、hairline 走 token。§1.4 缺失项大部分解决。
- **exam review（ExamScreen）**：结果页选项行（`reviewOpts/reviewOpt/reviewAnswerBox`）、生成中 `PulsingDots` + `generatingMsg` + 进度条、setup 表单 `sectionHeader/typeGrid/typeCard` 分段、heroEyebrow、填空 `answerInputSingle`。
- **其它**：`Screen scroll` 模式 `{...props}` 透传到 ScrollView（修 scroll 模式吞 prop）；`Overlay` center surface `maxHeight:85%` + `ProfileOverlay` body 改 ScrollView；`Overlay`/`ConfirmDialog`/`ComposerToolsMenu`（52px 行、30px icon、16px 标签）视觉回填；`ToolCard` 状态机改"running 展开 / 终态折叠"（`toolCards.js:516`）+ state icon + status/duration 行 + Input/Output 分节 copy 键 + `RichBlock showActions`（status dot + source/reload/expand，`vizActions` 端口）；`markdown.ts` 新增 `stripChatArtifacts` + `preprocessLite`（bullet glyph、table separator、setext `---`、lone `$…$` → `$$`，移植自 `preprocess.ts`/`helpers.ts`）+ `<step>` widget + ordered-list `start` 重播种；`MarkdownView` MathParagraph memo 按内容 key（防流式重挂 WebView）；`Icon` 默认色走 `useTheme`；`AppDrawer` 导航顺序改为 Home/Projects/Library/Scheduled/Plugins/More（对 `index.html #sidebarNav`，此前文档声称已匹配是误报）、加 `activeRoute` 高亮、session 分组 header（Pinned/Today/Yesterday/7d/30d/月份）；`CmdKPalette` panel `background`、list `60vh`、行字 medium；`Toast` queue 上限 3 + exit 动画。
- **残留已知缺口**（本次未做，需后续）：ShareModal visibility 三档 + revoke（后端 API 无）；StorageOverlay 域名（web archived 列表 + per-row restore）；UsageModal 53×7 heatmap（mobile 仍横条）；WorkspaceScreen Tiptap canvas；tldraw/three.js WebView；代码 syntax highlight；Android pinch-zoom（WebView）；plugin marketplace bridge；`ChatScreen` pending-attachments 条仍是旧行内 chip 样式（Composer 已收 `attachments` prop，迁移 ChatScreen 未做）；`viz.*`/`tool.*`/`common.copied` 若干 i18n key 走英文 fallback（strings.ts 由并行 agent 补充）。
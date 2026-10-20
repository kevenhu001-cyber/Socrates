# OpenAI UI 差距审计的整改回合

本轮从本地 `main@ee93806a` 开始，落地上一轮 OpenAI UI 差距审计（对照 <https://developers.openai.com/plugins/concepts/ui-guidelines> 与 `@openai/apps-sdk-ui` 的实测清单）中的 P0 与 P1 项。上一轮的审计结论只在工作会话中交付、没有落盘，本文件按仓库惯例补成可追溯的记录，并顺带修正 [前端 UI 体验评审](2026-10-16-frontend-ui-experience-review.md) 里已过期的条目。

改动已提交并推送（`b9b63f36` / `88e1d73a` / `6ae34705` / `18da7d32` / `2ff53480`），并已部署到生产。部署时 CI 门禁以 `DEPLOY_SKIP_CI_CHECK=1` 显式覆盖，覆盖记录写进 `.deploy-state.json` 的 `ciGate` 字段（`skipped-by-operator`）；原因、逐条失败清单与「部署时发现并修掉的既有竞态」见文末两节。

审计的结论与实测数据见上一轮报告；本文件只记录**改了什么、为什么这么改、怎么验的**，以及仍然敞开的项。

## P0-1 浅色令牌重配到 WCAG AA

### 出发点

浅色页底是 `#f8f8f8`。审计实测有 6 个浅色令牌达不到 AA 的 4.5:1（正文级）：

| 令牌 | 改前 | 改前对比度 | 改后 | 改后对比度 |
| --- | --- | --- | --- | --- |
| `--ui-text-tertiary` | `#8a8a8a` | 3.25 | `#6b6b6b` | 5.02 |
| `--ui-text-muted` | `#727272` | 4.53 | `var(--ui-text-tertiary)` | 5.02 |
| `--ui-text-secondary` | `#666666` | 5.46 | `#595959` | 6.60 |
| `--ui-danger` | `rgb(243 88 55)` | 3.16 | `rgb(176 45 28)` | 6.11 |
| `--ui-success` | `rgb(0 160 63)` | 3.24 | `rgb(12 110 51)` | 6.00 |
| `--ui-info` | `rgb(0 118 227)` | 4.21 | `rgb(0 92 184)` | 6.14 |
| `--ui-warning` | `var(--ui-thinking-accent)` | 1.68 | `rgb(125 82 0)` | 6.42 |

`--ui-text-placeholder` 保持 `#8f8f8f`（3.05）不动：它对齐的是参考实现的占位符色值，且被 `e2e/theme-contrast.spec.mjs:87` 与 parity 文档显式锁定。占位符不在这轮的可改范围内。

### 关键设计取舍

**不是只改令牌，先改用法。** `--ui-text-tertiary` 有 100+ 处消费点，但它同时被当作*文字色*、*图标色*和*背景色*用。直接把令牌压暗会让它与 `--ui-text-secondary` 几乎无法区分（两者都落在 5:1 附近），中性层级就塌了。做法是**重新分层**：

- `--ui-text-primary` `#1f1f1f`（15.52）不变；
- `--ui-text-secondary` 提到 `#595959`（6.60），把 secondary/tertiary 之间的 ΔL\* 撑回可辨；
- `--ui-text-tertiary` 压到 `#6b6b6b`（5.02），在最深浅色面 `#f4f4f4` 上仍有 4.84；
- `--ui-text-muted` 改成 `--ui-text-tertiary` 的**别名**。

`muted` 与 `tertiary` 本来就是同一个"弱化文字"角色，只是当年把 `muted` 提到过 AA 而漏了 `tertiary`。合并成一个源之后，**深色模式本来就是这么写的**（`--ui-text-muted: var(--ui-text-tertiary)`），浅色模式这次只是回到一致。

**语义色按"最坏底色"选，不只看页面底色。** 这些令牌在真实界面里是当文字用的：工具卡错误行、callout 标题、审批状态、设置里的"是"。它们经常压在 `color-mix` 出来的浅色染色底上（工具卡 8%、指标芯片 12%、删除按钮 16%）。所以选值标准是**在自己的 16% 染色底上仍过 4.5**，页面底色自然也过。

**`--ui-warning` 与 `--ui-thinking-accent` 拆开。** 原来 warning 直接别名 thinking-accent（`rgb(254 180 0)`，1.68），而 warning 是 callout 标题的文字色。thinking-accent 是图表/强调色，保留原来的鲜艳值；warning 另给一个深琥珀。

**顺带修掉两个"文字令牌当表面用"的角色错误：**

- `--ui-avatar-bg` 别名 `--ui-text-tertiary`。头像圆底因此从 `#8a8a8a` 变 `#6b6b6b`，白字对比度 3.45 → 5.33。**这修好了 `e2e/chat-light-palette.spec.mjs` 一条既有失败**（它断言头像前景/背景 ≥ 4.5，在改前就是红的）。另外把 `polish/mobile-controls.css` 里账号菜单头像的深字改成白字，与桌面规则一致（深字在浅色主题下只有 3.09）。
- 发送按钮底色用 `--ui-text-primary`（文字令牌）→ 改 `--ui-accent-strong`（强调色）。深色主题下按钮底从 `#e6e6e6`（亮度 0.79）变成 `#eeeeee`（0.855），**修好了 `chat-light-palette` 的另一条既有失败**（断言 > 0.8）。

### 门禁

`e2e/theme-contrast.spec.mjs` 新增一条用例：把 `--ui-text-secondary/tertiary/muted` 与 `--ui-danger/success/info/warning` 逐个解析成实际颜色，在页面底、`--ui-bg-surface`、`--ui-bg-bubble`、`--ui-bg-control` 四种面上各断言 ≥ 4.5；语义色再额外断言在自己的 16% 染色底上 ≥ 4.5；并断言 `muted` 与 `tertiary` 解析为同一个值（别名契约）。

## P0-2 css-debt 棘轮扩展到 legacy 通道

`themes.css` 里除了 `--ui-*`，还并行发布着一整套历史 HSL 通道（`--text-*`、`--bg-*`、`--border-*`、`--accent-*`、`--brand-*`、`--oncolor-*`、`--surface-*`），它们是冻结区 `legacy/`、`restore/` 的读取对象。**两套调色板并存且数值并不一致**（legacy `text-300` 是 54% 灰，`--ui-text-tertiary` 是另一档），live 文件读 legacy 通道就等于渲染出一个 `themes.css` 里没人选过的颜色。

- live 区原有 **19 处** legacy 通道读取（`polish/overlays.css` 13、`features/tool-surfaces.css` 6），全部迁到 `--ui-*` 角色；顺带删掉 `polish/overlays.css` 里硬编码的调色板字面量 `hsl(0 65% 55%)`。
- `frontend/scripts/check-css-debt.mjs` 新增指标 `legacyChannel`，正则 `var\(--(?:text|bg|border|accent|brand|oncolor|surface)-\d+`。
- 基线：**live = 0**（新增任何一处即失败），**frozen = 1429**（冻结区本轮不动）。

`--update` 同时让其余指标收紧：live `hexColor` 41→33、`literalRadius` 3→2、`stackedId` 46→45、`literalFontSize` 75→74，frozen `important` 692→689。棘轮只降不升。

## P0-3 composer 与消息列共用一个宽度基准

### 实测（改前，侧栏展开 260px）

用仓库外的 Playwright 量测工装（`/tmp/socrates-width/`）逐视口量 `x/width`：

| 视口 | 落地 composer | 会话 composer | 消息列 | 宽度差 | 落地→会话跳动 |
| --- | --- | --- | --- | --- | --- |
| 1024 | x=300 w=684 | x=260 w=764 | x=280 w=724 | 40 | 80 |
| 960 | x=300 w=620 | x=260 w=700 | x=280 w=660 | 40 | 80 |
| 880 | x=300 w=540 | x=260 w=620 | x=280 w=580 | 40 | 80 |
| 820 | x=300 w=480 | x=260 w=560 | x=280 w=520 | 40 | 80 |

宽视口（≥1128）下三者相等，所以问题在窄主列才显形。

### 根因

包含块链给出了确切机制：composer 按 `min(100%, --ui-content-chat)` 对着 `.chat-view` 的盒子量，而消息列按 `#msgList` 的 `max(20px, (100% - 768)/2)` 内缩。**两套公式，只在主列宽于 808px 时偶然相等。** 三条边的实际内缩各不相同：落地 composer 40（`mainInner` 16 + `#topicSetup` 24）、消息列 20、会话 composer 0。

### 做法

新增 `--ui-content-gutter: 40px`（`styles/tokens.css`），把会话侧拉到与落地侧同一个基准：

- `#msgList` 的横向 padding 下限从 20px 改为 `var(--ui-content-gutter)`；
- `.chat-view` 加同样的 `padding-inline`，`max-width` 改为 `calc(var(--ui-content-chat) + 2 * var(--ui-content-gutter))`，桌面限定（手机端保留自己被参考钉住的间距）。

选 40 而不是 20，是因为落地视图天然就是 40（两个嵌套 padding 恰好相加），沿用它可以**一行不改落地视图**；代价是窄桌面下消息列比原来窄 40px——但那里原本就是错位的。

### 复测（改后）

1440 / 1280 / 1120 / 1024 / 960 / 880 / 820 / 768 八个视口下，落地 composer、会话 composer、消息列的 `x` 与 `width` **完全一致**（Δw=0、Δx=0、跳动=0）。

## P0-4 主按钮只负责提交，麦克风是唯一听写入口

`index.html` 与 `src/i18n/en.js` 里早就有 `P_composer-primary-split` 的契约——"麦克风是唯一听写入口，主按钮只管提交（send / stop）"，主按钮初始 30% 禁用直到有草稿。但实现只迁移了一半：标记与 i18n 注释已经改好，**JS 行为、图标与四个 spec 仍停在旧行为**（空态主按钮渲染声波字形、标注 "Start voice input"、点击启动听写）。

结果就是审计记录的：同屏两个控件宣告同一个动作，屏幕阅读器用户分不清哪个是麦克风。

### 改动的 5 个触点

| 文件 | 改动 |
| --- | --- |
| `src/react/lib/boot/indicatorComponents.tsx` | 空态不再渲染 `VoiceWaveIcon`，主按钮恒为发送箭头；移除 `AudioLines` 依赖 |
| `src/ui/legacyShellListeners.js` | 删除"无草稿 → `toggleSpeechInput`"分支 |
| `src/ui/topicSetup.js` | 空态标签从 `chrome.startVoiceInput` 改为 `chat.send`；`disabled` 按"有草稿才可发"计算 |
| `src/i18n.js` | 主按钮标签恒为 `chat.send` |
| `src/ui/voiceInput.js` | `setListening` 不再给主按钮挂 `.is-listening` / `aria-pressed`（否则发送键会被念成"已按下的听写按钮"） |

另外 `src/chat/composerTurn.ts` 的 `setChatStopState` 同步维护 `disabled`：**流式开始时必须重新启用**，否则"无草稿即禁用"会把唯一的 Stop 变成不可达。用 `.active` 类（composer controller 维护的 canSend 信号）做判据，draft 清空与流开始的先后顺序不影响结果。

`chrome.startVoiceInput` 随之在 en/zh 两份字典中删除（`check-i18n-locales` 要求两语 key 集合一致）。

### 同步更新的 spec

`voice-input`（4 处）、`react-compat`（3 处）、`mobile-composer-reference`（2 处）、`mobile-reference`（1 处）共 10 处断言从"空态声波 + 可用"改为"空态发送箭头 + 禁用"；听写动作改由麦克风触发。

## P1 项

### 顶栏切换器的可访问名（WCAG 2.5.3）

`#topModelSwitcher` 可见文字是 "Socrates Beagle"，`aria-label` 却是静态的 "Model and reasoning"——可访问名不含可见标签，违反 WCAG 2.5.3（Lighthouse 的 `label-content-name-mismatch`）。

可见文字随模型变化，静态 aria-label 无法满足契约，所以**由 JS 拥有这个名字**：`src/ui/effortPicker.js` 在写模型名的同时把 aria-label 设为 "Socrates Beagle — Model and reasoning"（目的短句仍走 i18n key）。标记上删掉 `data-i18n-aria`，否则 `applyI18n` 会在切换语言时把名字覆盖回静态值；`i18n.js:180` 的 `window.syncEffortUI()` 保证语言切换后重建。

### Hero 字号

`styles/layout/app-shell.css` 的 hero 用的是 **原始** `--app-font-scale`（默认 1.125），而整套字号体系用的是归一化的 `--app-type-scale`（`--app-font-scale / 1.125`）。结果 hero 渲染成 27px（参考 24px）。改用 `--ui-text-hero`（= `calc(24px * var(--app-type-scale))`）后回到 24px。`home-customization` 那条"XL 档 hero 放大 > 1.2 倍"的断言不受影响——比值与缩放的归一化无关。

### 模型名

`.top-model-switcher-model` 从 tertiary + 400 改为 secondary + 600：参考的切换器是一整串 18px/600，模型名是控件的**取值**而不是弱化元数据。

### 错误呈现统一

`.msg-error` 原本是带边框的卡片、文字 11px；工具卡的 `.tool-inline-error` 是 13px 裸文本——同一屏上一红框一红线。现在两处都是 danger 文字、同为 13px（`--ui-font-size-xs`）；回合级错误因为还承载 Retry/Resend 动作，保留一条 2px danger 左侧标线（与 callout、引用的左规则语言一致），而不是卡片——卡片套卡片正是参考规范要避免的。

### 显示设置浮层去重

三行都是"标签 + 右侧读数 + 分段控件"，读数与高亮段重复（审计记录的是 "THEME Dark" 与高亮 "Dark" 并列）。主题行本来就是 `role="radiogroup"`（选中有语义），字号/宽度行不是（读数是唯一的文字来源）。做法：三行统一由分段控件自身表达当前值，**读数全部去掉**，字号/宽度两组补上 `role="radiogroup"` + `role="radio" aria-checked`。两个 spec 改为断言"被选中的分段"。

## 验证

- `npm run lint`：**0 error / 455 warning**（与改动前基线一致），其中 css-debt 棘轮通过（live `legacyChannel=0`）。
- `npm run test:unit`（frontend）：**990 / 990 通过**（988 + 部署阶段新增的 2 条桥接层用例）。
- 构建：`npm run build` 通过（中途因 `composerTurn.ts` 的 `HTMLElement` 缺 `disabled` 报过一次 TS2339，已用 `HTMLButtonElement` 收窄修掉）。
- Playwright（21 个受影响 spec，单 worker，3.3 分钟）：**81 / 81 通过**。

### 顺带修掉的既有失败

改动前在**干净 HEAD** 上先跑了一次同样的 spec 集作为基线，基线上有 4 条失败。其中 2 条由本轮改动直接修掉：

- `chat-light-palette` 的头像对比度（3.45 < 4.5）—— 头像底色跟随 `--ui-text-tertiary` 压暗后为 5.33；
- `chat-light-palette` 的深色发送按钮亮度（0.791 < 0.8）—— 按钮底色改用 `--ui-accent-strong` 后为 0.855。

另外 2 条是 **spec 钉死了过期常量**，本轮一并改正（不是放宽阈值）：

- `chat-light-palette` 的移动端画布渐变断言原本写死白色 `rgb(255,255,255) 24px`。渐变实际用的是 `var(--ui-bg-page)`，浅色页早已从 `#fff` 变成 `#f8f8f8`。断言改为**读取实际渲染的页面色再比对**（`${canvas} 24px`），意图（"渐变落在页面色上、不是黑带"）不变，而三条头部控件的对比度检查改为对真实画布色计算——`#f8f8f8` 比白略深，门槛反而略严。
- `mobile-reference` 的手机 composer 底色断言原本期望 `rgb(28,28,28)`（#1c1c1c）。`docs/ref/mobile-reference-2026-10-04.md:21` 写明的是 "black page, composer #212121"，`themes.css` 发的也是 `#212121`——断言与参考和实现都不符，改为 `rgb(33, 33, 33)`。

## 部署时发现并修掉的一个既有竞态

这一节记录的是**部署准备阶段**发现的东西：它与本轮 UI 整改无关，但挡在部署门禁前面，所以顺手修了。

**现象。** CI run `39360582444`（commit `6ae34705`）比改动前的基线 run `39351963933`（commit `ee93806a`）多一条失败：`e2e/react-compat.spec.mjs:64`「React chat store observes legacy message and stream lifecycle」。基线是 9 failed / 524 passed，这一轮是 6 failed / 528 passed——本轮修掉了 `chat-light-palette`×3 与 `mobile-reference`，却同时冒出这一条。

**归属：不是本轮改动引入的。** 同一台机器、同一组参数（`--repeat-each=15 --workers=4`）压测：改动前基线 `ee93806a` 挂 1/15，`6ae34705` 也挂 1/15——失败率一致，CI 在基线那次只是没踩到。

**根因。** `frontend/src/react/chatRuntime.bridge.ts` 的 `P_bridge-coalesce-lifecycle` 把 `message-added` 与 `stream-started` 合并进**一个槽位**，同帧内后到的覆盖先到的。`e9c0ffe2` 引入它时的前提是「last wins 等价于两次同步提交」——这只对**最终快照**成立，对**通知次数**不成立：订阅者采样 `lastEvent` 时就看不到 `message-added` 了。两个事件是否落在同一帧取决于帧边界，所以是竞态而不是恒定行为。契约依据在 `e2e/react-compat.spec.mjs`（它断言的就是「订阅者必须看到两个事件」）；`e9c0ffe2` 改了桥接层但没动这条 spec。

**第一次修法过度了。** `18da7d32` 把单槽改成**队列**、每个事件各提交一次。契约守住了，但同一帧里连发 18 条 `message-added` 的场景（会话列表一次长出 18 条消息）会变成 18 次全量 reconcile——正是那个槽位当初要省的成本。CI 立刻抓到：`e2e/keyboard-viewport.spec.mjs:423` 在 run `39364373391` 上失败，而它在 `6ae34705` 上是绿的；本地压测 2/20 对 0/20。

**最终修法（`2ff53480`）。** 槽位**按事件类型**各留一个：同类事件后者覆盖前者（取最新的 messageId）但保留原有位置，于是发布顺序不变。一帧 18 条 `message-added` 仍只提交 1 次，而 `message-added` + `stream-started` 提交 2 次——契约要的正是后者。

**验证。**

- `test/chatRuntimeStore.test.mjs` 新增两条用例，用假 rAF 确定性地驱动这次碰撞：同帧两个事件必须都被看到；同帧 12 条 `message-added` 必须只提交 1 次且快照带齐 12 行。
- e2e `react-compat` 那条：修复前 14/15，修复后 30/30。
- `keyboard-viewport` 重载压测（同一台机器、同一参数）：HEAD 与 `6ae34705` 均为 2/60——一致，说明它本身是既有抖动，不是回归。
- `confirm-dialog.spec.mjs:89`（焦点恢复）也是负载敏感的既有抖动：HEAD 192 次测试中 1 次失败，基线 `ee93806a` 288 次测试中 1 次失败，同一失败率。
- 单测 990 / 990；桥接相关 13 个 spec 重载跑 96 / 96；lint 0 error / 455 warning（与基线一致）。

## 部署与门禁

**命令。** `DEPLOY_SKIP_CI_CHECK=1 ./deploy.sh`。**不要**用 `--dry-run`：它只跳过 CI 门禁，参数解析不匹配，随后仍会走完整生产部署路径。

**门禁状态。** CI 工作流是红的，红的原因全部是**既有**失败，与本轮改动无关：

1. `chatgpt-oled-replicas` —— 截图基线陈旧（基线图 252×497 vs 实际 252×388，25% 像素不同）。基线最后刷新于 2026-10-10，此后有 78 笔 UI 提交。**本轮没有顺手重刷**——那等于替 78 笔提交「洗绿」，应由人审阅 PNG diff。
2. `composer-tools-visual-baseline` —— 同上。
3. `placeholder-localization` ×2 —— 字体栈缺 `Noto Sans SC`，而字体栈方向（系统栈 vs 保留 Plus Jakarta Sans）是留给用户的产品决策。
4. `sidebar-rail` —— 断言写死 `rgb(252,252,252)`，light 主题的 `--ui-bg-sidebar` 是 `#ffffff`，3/255 之差。没有参考文档能判定哪边是对的，所以本轮不动。

本轮相对基线**没有新增**失败：基线 9 条 → 本轮 4 条（修掉 `chat-light-palette`×3、`mobile-reference`），加上部署期间发现并修掉的 `react-compat` 竞态。

**部署内容与结果。** `faaed6f5` → `2ff53480`，13 个提交，含 85 个 frontend 文件与 27 个 server 文件；无新迁移（上次部署已含到 `0044`）。入口 `index.1792473412.html`（75067 bytes），nginx `try_files` 已指向该文件，16 项健康门禁全过，`ciGate` 记录为 `skipped-by-operator`。

## 仍然敞开 / 本轮未做

- **字体栈方向（审计 P2）**未动：仓库里三套字体栈并存（`themes.css` 实际生效的 `"Inter","MiSans","Plus Jakarta Sans"`、`legacy/00-foundations.css` 注释里写的 Plus Jakarta Sans primary、`legacy/02-modals-library.css` 硬编码的第三套）。OpenAI 的规范是"始终继承系统字体栈"，`docs/ref/chatgpt-parity.md` 记录的却是"保留 Plus Jakarta Sans 作为唯一 UI 字体"。这是产品决策，本轮不自行拍板。
- **深色占位符** `--ui-text-placeholder: #6b6b6b` 在深色面上是 3.27，同样低于 AA。本轮只做浅色主题，占位符一档保持参考色值。
- **审计 P2 的卡片规则**未动：可视化卡片的 4 个等权重动作、`IntelligentSurface` 用 `<select>` 让用户切 5 种显示模式、卡内 `role="tablist"`、Canvas 工具栏 5 个按钮、5 处嵌套滚动。这些是结构改动，量级高于本轮。
- **命名空间仍分裂**：`--cg-*` / `--chatgpt-*` / `--conversation-*` 三套别名桥接仍在 `themes.css` 里，`restore/` 仍活 569 个 `!important`。
- **legacy HSL 通道本身仍在**：`themes.css` 继续发布 `--text-*` / `--bg-*` / `--border-*` / `--accent-*` 等通道供冻结区读取（frozen 基线 1429）。彻底退役要动 `legacy/` 与 `restore/`，属于冻结区，本轮不做；棘轮已经保证 live 区不再新增。
- **桥接层仍做帧级合并**：`react-compat` 那条竞态的根因修了，但同类风险还在——未来若再引入新的帧级合并路径，需要同样逐事件核对「会不会把某个事件类型整个吞掉」。`test/chatRuntimeStore.test.mjs` 的两条用例是这一类的守门断言。
- **两条负载敏感的既有抖动只做了归属取证**：`keyboard-viewport.spec.mjs:423`（composer 变高时 transcript 失钉）与 `confirm-dialog.spec.mjs:89`（对话框关闭后焦点未归位）。本轮用同机同参对照确认了它们与本轮改动无关，但**没有定位根因、没有降低抖动率**——它们需要各自的专项。

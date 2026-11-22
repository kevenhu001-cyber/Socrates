# UI 结构与迁移边界

更新：2026-11-22。本文描述当前代码的职责、生命周期协议和剩余迁移债务。
历史迁移计划中的旧目录 / 旧工作流不能作为当前入口清单。
前端 JavaScript → TypeScript 迁移已完成；窗口桥接和旧 DOM 写入者仍按领域逐步退役。
2026-11-22：ADR 0027 将 **React DOM 定为唯一 UI 栈**。`packages/ui` 组件是普通 React DOM
组件；本地 `packages/ui/src/react-web.tsx` shim 已冻结，直接 importer 只减不增（当前 5）。
下方 RN-1～RN-14 章节只记录历史迁移过程，不是新代码规范。
2026-11-17：字符串键状态 facade `state/store.ts` 及其浏览器全局 `window.stateStore` 已退役（文件已删除）；
状态访问只经 `frontend/src/store/index.ts` 的类型化 hooks 与 bridge，代码树里残留的 `stateStore` 字样只是过期注释。
2026-11-16：Expo Universal App（`apps/socrates/`）及其专属包、barrel、CI lane 已删除；
`frontend/` 是唯一生产 Web 客户端。

## 客户端职责

| 目录 | 当前职责 | 共享与隔离边界 |
|---|---|---|
| `frontend/` | 唯一生产 Vite SPA，视觉与功能基准，React DOM 迁移目标 | React 渐进接管静态 shell；共享组件经窄子路径 + Web host adapter 挂载 |
| `packages/ui/` | 共享 React DOM 呈现组件（仅子模块，无根 barrel） | DOM-free；SPA 经 Web host adapter 使用，不读 DOM 逻辑 |
| `packages/theme/` | 共享 token 与 RN 色值；新 UI token 生成源 | `ui.ts` 生成新 UI CSS 变量；SPA 现有几何仍归 tokens.css，最终调色板及别名桥接归 themes.css |
| `apps/socrates-android/` | 独立 Kotlin + Compose Android | ADR 0021 例外，共享 `/api/v2` 协议与 `@socrates/core` |
| `site/` | 独立营销和文档站 | 独立部署，静态资源修改要同步 cache-busting 版本 |

`mobile/`、`capacitor/`、`apps/socrates/`（Expo Universal App）均已删除。
`desktop/` 导出物也已删除，仓库不再保留桌面端代码。

SPA 是唯一生产 Web 端；React DOM 是唯一 UI 栈。`react-web` shim 只减不增，不能作为新组件的
依赖。未移交表面继续保留现有宿主 ID、密度、截图与样式优先级契约。
`packages/ui` 只持有共享呈现，Web 宿主、认证时序、DOM 测量和兼容动作仍留在 frontend 的适配边界。

## SPA 入口与依赖方向

```text
index.html                         静态 shell / 挂载宿主 / CSP
  └─ src/main.ts                   启动组合，batchStorage.ts 必须最先导入
      ├─ app/ + auth/              启动、认证、旧行为组合
      ├─ sidebar/                  导航目的地、服务和状态
      ├─ chat/ + session/          会话、持久化和流式业务
      ├─ ui/                       中立 DOM 适配、展示模型和跨层协议
      │   ├─ msgListMount.ts       按实际节点记录 live / shared 归属
      │   └─ assistantTurnRenderer.ts  分享工具 turn 的类型化注册接口
      └─ react/bootstrap.tsx       注册 renderer，安排可见界面挂载
          ├─ lib/boot/specs.tsx    声明宿主和加载顺序
          ├─ lib/boot/registry.ts  过滤、预留、异步成功 / 失败处理
          ├─ lib/boot/ownedRoot.ts 唯一 createRoot / hydrateRoot 所有者
          ├─ lib/boot/pageMounts.ts + pageLoader.ts  导航时加载页面
          └─ 各功能组件           JSX + bridge / store + 业务服务
```

- React 从 `store/`、功能 store 或类型化 bridge 读取状态；旧全局动作经
  `react/legacy/gateway.ts` 访问，不在组件里扩散任意 `window.*`。
- 六个 `state/` 命名空间 store 仅保留模块导出；已删除无消费者的 `window.__socrates{Session,Kb,Search,Call,Ui,Exam}Bridge` 别名。
  字符串键 facade `state/store.ts` 已于 2026-11-17 退役：文件已删除，不再安装或发布 `window.stateStore`，
  聊天历史、诊断生成和搜索刷新策略改由 `store/index.ts` 的类型化 hooks 与各领域 bridge 读写。
  代码树里残留的 `stateStore` 字样只是过期注释；仅有两个遗留 e2e 仍引用该全局
  （`e2e/zz-ui-repro.spec.mjs` 直接调用，`e2e/storage-bootstrap.spec.mjs` 断言它不存在）。
- `chat/` 不依赖 React 实现；共享类型可来自 `react/types/`，宿主状态与展示模型留在 ui。
  不通过新增 re-export shim 延长旧路径寿命。
- 首轮发送时预先创建的 streaming placeholder controller 暂存于 `chat/turnState.ts`，由 `askChatTurn()`
  一次性领取，新会话与全量 turn reset 时清空；不再用 `window.__socratesSyncCtl` 跨模块转交。
- 当前流式请求或链接页准备阶段的取消回调存于 `turnState.activeChatAbort`；流 attempt 与 session / app
  生命周期从同一模块状态读写，流结束时仍按回调身份清理，旧流不会清掉新流的取消入口。
- Composer 的 draft、token、focus 操作由 `composer/controller.ts` 命名导出；侧栏 OAuth 恢复与创建助手入口
  直接导入这些函数，不再发布 `window.__socratesComposerController` 对象。
- 插件目录和选中状态由 `frontend/src/composer/` 持有；聊天、OAuth 返回恢复和 React
  读取同一模块实例，React 订阅只留在 `useComposerPluginSelection.ts`。聊天层对 React
  实现的直接依赖已归零，插件选择不再依赖 window bridge。
- Admin、聊天配置、快捷键、会话内查找、设置和存档 UI 的调用者直接使用各自模块状态；不再把这些
  状态发布到 window。状态共享由模块 store 承担，旧全局仅保留明确的动作和兼容入口。
- 确认弹窗、prompt templates 与 More 菜单状态由 `ui/confirmState.ts`、
  `ui/promptTemplatesState.ts`、`ui/morePopoverState.ts` 持有；React 通过 hook adapter
  订阅同一模块实例，不再读写对应的 window bridge。More 菜单显隐仍由 sidebar DOM class 管理。
- Usage 弹窗数据由 `ui/usageState.ts` 持有；旧模块继续负责 API 请求和 overlay class，React
  直接订阅 HTML 与周期状态，不再经 `window.__socratesUsageBridge` 中转。
- Share 弹窗数据由 `ui/shareState.ts` 持有；share facade 仍负责懒加载和窗口动作兼容，功能模块
  负责 API 请求，React 直接订阅 visibility、链接与状态，不再发布 `window.__socratesShareBridge`。
- Profile 数据与 sidebar 账户摘要分别由 `ui/profileState.ts`、`ui/sidebarUserState.ts` 持有；React
  直接订阅模块状态，`ui/profile.ts` 保留账号动作、tier 属性同步和外层 overlay class，不再用两条
  window bridge 中转。
- Composer Tools 的 `isOpen`、mode 与 trigger 由 `ui/composerToolsState.ts` 持有；旧模块继续负责菜单
  定位和动作入口，React 直接订阅状态，不再从 `window.__socratesComposerToolsBridge` 读取。
- 附件待上传列表仍由 `attachments.ts` 持有，稳定的 `window.attachments` 数组引用供旧调用者使用；`attachments.ts`
  与 `attachments/render.ts` 将更新发布到 `ui/attachmentsState.ts`，React 订阅不可变数组快照，不再经
  `window.__socratesAttachmentsBridge` 中转。
- Recents/session-list 数据由 `session/sessionListPublisher.ts` 汇总后发布到 `ui/sessionListState.ts`；
  React 与 composer queue banner 订阅同一模块状态，选中行的即时高亮也更新此 store，不再依赖
  `window.__socratesSessionListBridge`。`window.SERVER_SESSIONS` 仍是旧 session cache 的兼容入口。
- Cmd-K 搜索状态由 `ui/cmdKState.ts` 持有；懒加载的 `ui/cmdK.impl.ts` 发布搜索结果，React 菜单订阅
  同一模块 store。命令动作仍通过 `window.openCmdK` 等兼容入口触发，不再经 `window.__socratesCmdK`
  发布状态。
- Explore / analyze 的工作流阶段事件由 `extensions/agentRunStore.ts` 在模块内发布；扩展 context、聊天工具回调和
  React 阶段卡片共享同一 store，不再安装 `window.__socratesAgentRunBridge`。
- 聊天运行时快照由 `ui/chatRuntimeStore.ts` 持有；React 消息列表与 composer 直接订阅模块实例，旧聊天调用者
  通过 `ui/reactBridge.ts` 发布到同一 store。工具运行时通过注入的事件发布器更新状态，不再查找
  `window.__socratesReactChatBridge`。构建后浏览器集成可用 `socrates:chat-runtime-publish` 事件发布，
  观察方通过 `socrates:chat-runtime-changed` 接收生命周期通知。泛型 `createImmutableBridge` 也不再支持
  `windowKey` 发布。
- KaTeX 懒加载就绪时直接订阅模块导出的重绘函数，render revision 也由模块单例持有；不再发布没有读取方的
  `window.__socratesRerenderMath` 回调。
- `auth` 的 `__socratesMountReactCompatibility` 仍是兼容启动通知，保留认证后才加载
  editor / modal 的时序。消息挂载和分享接管的四个 window 字段已由中立模块替代。
- 扩展定义由 `extensions/index.ts` 注册并导出 `dispatchExtension()`；picker、composer tools、首页写作入口
  与 creation surface 直接调用同一模块 dispatcher，不再经 `window.__socratesExtensionDispatch` 转发。
  `composeAction`、`toggleExtensionByKey` 等既有 inline 兼容动作仍保留。

## React root 生命周期

| 场景 | 接口 | 保证 |
|---|---|---|
| 普通组件、临时弹窗 | `mountOwnedRoot` | 同节点同标签复用；跨标签拒绝接管；旧 handle 不再写入或清除新 root |
| 页面 / 编辑器 / 设置 / 附件 | `createRootSlot` | 只有一个当前宿主；替换时释放旧订阅与 portal |
| 只读工具 turn | `createRootGroup` | 每个容器独立更新并保留组件状态；支持逐个或批量释放 |
| 静态 new-reply pill | `hydrateOwnedRoot` | 采用已有 DOM，再共享普通 root 的更新与清理 |
| sidebar chrome | root slot + portal disposer | footer / recents 宿主变化时重建整棵 root，释放旧 footer 所有权 |
| whiteboard | lazy adapter + `mountOwnedRoot` | 由可视化卡负责销毁，保持重型依赖懒加载 |

所有模式最终都由 `ownedRoot.ts` 创建 / hydrate。`handle.render` 显式更新已有树，
`handle.destroy` 释放 root、installer 返回的 disposer 和宿主所有权。
设置服务一次提交打开状态和目标分类。分类加载等到打开状态提交才启动，已访问的分类保留到下次重开。
普通页面仍在导航时挂载。

`lint:react-roots` 已接入 frontend lint。它通过 AST 检查直接 import（含 alias / namespace）、
dynamic import 与退役全局字段；类型 import、注释和字符串不计。
零债务 baseline 的 `--update` 只能缩减，不能为新增路径放宽。

## 页面加载协议

`pageLoader` 用 WeakMap 绑定实际节点，合并同一宿主上正在进行的 import。
加载与挂载分离：import 完成后核对当前 DOM 宿主，替换节点的迟到结果直接退出。
只有初次未挂载的宿主写入 skeleton；加载或刷新失败不会用错误字符串覆盖已有 React 内容。
各调用者的 afterMount 独立执行并处理异步错误，失败后可重试。

注册表在懒加载期间预留宿主，阻止旧 DOM 写入与重复启动；成功后记录完成，失败则报告并释放预留。

关键启动宿主（composer、topbar、message list、sidebar nav / chrome）通过注册表的 `onFailure` 提供局部恢复提示。
提示只追加独立节点，不清空旧内容、不写草稿或消息状态，也不依赖失败的动态 UI chunk。
重试仅执行失败的 spec；实际宿主被替换、已有 root 或已有占用时，旧重试入口不执行。
进行中的重试沿用宿主预留去重；成功或明确返回 `false` 后释放提示及按钮监听，失败则替换为可再次操作的提示。
非关键浮层继续按需加载并上报失败，不因局部故障强制刷新整页。页面 `loadPage` 的失败恢复仍是独立协议。

恢复提示是 `react/ui/mountRecovery.ts` 内的 boot-safe 原生适配器，复用 `.btn` / token / i18n，
不额外创建 React root，不拉入菜单、弹窗或编辑器依赖。注册表中的失败若发生于 root 已创建之后，
不得释放该 root 的所有权或追加提示覆盖它；组件渲染异常仍由各自的 ErrorBoundary 处理。

## Transcript 与分享协议

1. live message list 挂载时 claim 实际宿主；流式代码通过 `isMsgListMounted` 查询当前 DOM 的归属。
2. 分享接管先标记当前节点只读，再释放聊天 root，然后释放旧工具 turn 和可视化资源。
3. 之后才能清空子节点并渲染分享内容。工具 turn 经 `assistantTurnRenderer` 调用同一 React renderer，
   强制 readOnly；renderer 未注册、旧数据没有 split points 时保留 prose / 持久化 HTML fallback。
4. 一个工具容器从结构化 turn 变为 fallback 时，先释放 root 再允许写入旧 HTML。
5. 宿主替换后旧节点的 live / shared 状态不继承；旧 claim 清理也不能清掉新 claim。

消息工具栏、Retry、approval 等写操作不会在分享 turn 中出现。
分享提示条跟随 transcript 位于 chatPage，避免被隐藏的旧 landing 容器连带隐藏。

## 样式、动效和静态资源

- 唯一样式入口 `styles/index.css`：结构 token → legacy 兼容几何 → 当前组件、restore、parity、
  polish → themes。themes.css 只导入一次且最后导入。
- 桌面 sidebar / topbar / composer / transcript 的所有者位于 parity；移动目录密度遵循固定参考。
- 桌面主区域使用网格：顶部栏和聊天内容共用左列，工作台位于右列并跨两行；
  顶部栏的网格位置仍由 `parity/topbar.css` 持有。手机继续使用原有布局。
- React 的原生 JSX 按钮集中在 `react/ui/Button.tsx`；`IconButton` 复用该原语并要求
  可访问名称。现有功能类名仍负责各自外观，迁移不等于所有按钮已共享同一视觉变体。
  按钮 ratchet 已收紧至零；带原生默认提交语义的存量按钮显式保留 `type="submit"`。
- 菜单与 FoundationDialog 通过 starting / ending 状态驱动 transition，从当前进度反向过渡。
  进入 opacity 180ms / transform 220ms，退出 120ms；使用现有 token，仅读写 opacity / transform。
- workspace pane 局部 reveal 6px / 180ms；布局同步提交，连续导航取消旧动画，同页不重播。
  外壳、聊天消息和 composer 不跟随位移；reduced-motion / forced-colors 跳过动效。
- 动效取向参考 [OpenAI Canvas 的并列工作区](https://openai.com/index/introducing-canvas/) 与
  [Claude Artifacts 的对话旁工作区](https://www.anthropic.com/news/claude-3-5-sonnet)，具体参数来自本项目。
- 白板采用 [tldraw 官方 Vite 静态资源接线](https://tldraw.dev/installation#static-assets)：
  assetUrls 来自 `@tldraw/assets/imports.vite`，tldraw / assets 均锁定 5.5.2。
  字体、SVG、embed 图标与翻译走同源构建产物；需要 fetch 的 JSON URL 不内联为 data:，保持现有 CSP。
  新依赖不需要 install hook，allowScripts 仍只允许 esbuild。
- 聊天 prose 的 p / li / strong / link 颜色规则止于 tldraw 容器边界；白板文字由编辑器拥有，
  避免深色聊天前景色覆盖浅色笔记的文字颜色。legacy/14-tool-surfaces 中重复的 prose 颜色规则已删除，
  这些文字与链接规则统一归 features/tool-surfaces 所有。

## 剩余债务与处理顺序

以 2026-11-17 的设置收敛批次为基准。

| 领域 | 当前进度 | 下一步 |
|---|---|---|
| 旧 DOM 与 React | 主页面由 React 接管，静态挂载宿主、未接管时的 DOM fallback、分享只读渲染与认证后的挂载仍在生产链路中。`app/legacyBridge.ts` 继续向 React gateway 和旧入口提供动作。 | 下一项 DOM 宿主工作选附件。盘点 `attachments/render.ts` 的 `socrates:composerready` 与 `DOMContentLoaded` 接线，由 composer 宿主显式绑定和释放对应节点。覆盖宿主重挂载、粘贴、拖放和文件选择。消息另按 live／未挂载／分享三态排查写入者，保留旧消息的 HTML 读取。 |
| window bridge / 自定义事件 | 侧栏和模型菜单都调用类型化设置服务，`socrates:settings-section` 的两个派发点和监听已移除。`window.stateStore` facade 已于 2026-11-17 退役，不再有生产调用；认证后的 `__socratesMountReactCompatibility` 仍有生产调用和浏览器回归依赖。 | 聊天历史与诊断／搜索的状态读取已迁到类型化 store，无需再分域迁移。图表预热另梳理 typed publisher 与浏览器事件两条路径。认证挂载独立提交，保持 auth gate 后加载与 share 的轻量路径，跑 `boot`、`storage-bootstrap`、`mount-recovery`、`message-list-compat` 和 `share-view`。 |
| `legacy/` / `restore/` | `lint:css-debt` 冻结区上限：`!important` 295、硬编码颜色 28、硬编码半径 123、堆叠 ID 27、硬编码字号 225、legacy 通道 506。`legacy/08-exam.css` 的 `.exam-view-body` 与 `.exam-view-footer` 仍由考试的 Web 宿主使用。 | 每次移交记录旧 selector 在静态 shell、React、动态类名和 fallback 的消费者。确认无消费者后单独清理，跑 `lint:css-debt` 和受影响的视口回归。`themes.css` 保持最后导入。 |
| React DOM 迁移签收 | 考试已签收。设置「对话背景网格」（开关）与「文字大小」、「内容宽度」（分段单选组）均使用共享 `@socrates/ui/settings` 组件接入，现有 React/shadcn 弹窗持有标签行几何、焦点和分类懒加载。剩余 5 个文件仍直接引用 `react-web` shim。 | 从 `packages/ui/src/primitives` 与 `shell` 开始改为 DOM + CSS，删掉 shim import 后用 `lint:rn-shim --update` 降低基线。 |

DOM 体量以第一方 TS/TSX 中字面 `getElementById(` 为抽样指标，当前 282 处、97 个文件（以 `rg` 输出为准）。这个计数包含
读取和挂载宿主的查找。`window.stateStore` 的清理已经完成：facade 于 2026-11-17 退役，代码树里残留的 `stateStore` 字样是过期注释，只有两个遗留 e2e 仍引用该全局（`e2e/zz-ui-repro.spec.mjs` 直接调用，`e2e/storage-bootstrap.spec.mjs` 断言它不存在）。

## 验证记录与入口

| 阶段 | 单测 | 浏览器回归 |
|---|---|---|
| 首轮：普通 root | 6/6 | 57 个用例验证；手机 drawer 视口初始化修正后重复 3/3 |
| 第二轮：页面 / 动效 | 14/14 | 88 个不同用例，最终修正交集与布局集 43/43 |
| 第三轮：消息 / 分享 / 白板 | 15/15 | 58 个不同用例：消息/流式集 43/43；最终编辑器颜色与主题/布局集 26/26 |
| 第四轮：弹窗结构化 / 数学修订与轻量提示收敛 | 7/7 | 24 个不同用例通过：sidebar-nav 16/16，message-list 7/7，storage-bootstrap 1/1 |
| 第五轮：模态无障碍标准化、桥接直调解耦与附件类型化 | 24/24 | 26 个用例全通：sidebar-nav 16/16，message-list 7/7，recents-archive 1/1，storage-bootstrap 1/1 |
| 第六轮：Admin 模态标准化、10 个遗留模块 TS 迁移与基线紧缩 | 14/14 | 22 个用例全通：sidebar-nav 16/16，chrome-i18n 4/4，recents-archive 1/1，storage-bootstrap 1/1 |

当前最小单测：ownedRoot、modalA11y、cookieConsent、foundationTokens、legacyGateway、attachments、sessionListState、cmdKState、proseRenderer。
启动恢复另覆盖 mountRegistry 单测与 `e2e/mount-recovery.spec.mjs`：失败、重复重试、旧宿主、占用移交、
提示清理、保留草稿节点，以及生产 chunk 请求失败后不刷新页面恢复编辑器。新增用例须以本轮实际执行结果签收，不能沿用历史记录。
先 build，再按 diff 跑 message-list-compat、share-view、whiteboard-lifecycle、chat-send、
chat-stop-resend、streaming-render、react-compat、storage-bootstrap、recents-archive 等 Playwright。
frontend lint 包含类型与全部 24 项架构护栏；测试截图和报告保持 gitignored。
当前守卫基线：未类型化前端 JS 为 0、转发 shim 为 0、未埋点空 catch 为 0。曾有 171 个空 catch 未接入遥测；本轮为其中 170 个添加 `reportSwallow`，包括将最佳努力与平台探测错误标记为 `expected`，其余按受限的 `recoverable` 遥测处理。遥测初始化自身的 Vite 元数据回退保留为一条有理由的豁免。

## 状态更新（2026-10-30）

- `frontend/src` 的 JavaScript → TypeScript 迁移已签收；不要再把 10 月 26 日记录的 109 个遗留 JS 当作当前数量。
- 类型化兼容入口仍然存在：`app/legacyBridge.ts` 和认证后的 `__socratesMountReactCompatibility` 仍服务旧 DOM 与 React 边界。应用状态 store 已不再发布为 `window.__socrates*Bridge`；迁移到 TypeScript 也不代表 SPA 兼容层整体已退役。
  （2026-11-17 更正：本节原列的 `window.stateStore` 已退役——facade 文件已删除，状态访问只走 `store/index.ts` 的类型化 hooks 与 bridge。）
- 命名 SSE `error` 帧现在把状态码、错误码、是否可重试及限流等待提示一路保留到共享 API 的 `ApiError`。旧式只带消息的帧仍按 `502` 处理。
- 未埋点空 catch 已清零：170 个调用点接入内容不外发、全局限流的 `reportSwallow`；76 个明确的可选能力、清理或最佳努力场景仅计入开发期预期吞错计数，其余异常按可恢复故障报告。剩下一处遥测初始化的 Vite 元数据回退有理由豁免。
- 生产数据库迁移、Expo CLI 上游依赖修复、仍在使用的 SPA 兼容边界与跨端功能签收继续单独跟踪；
  usage 缺失时的 token 估算已改为适配中文的保守回退。汇总见
  [2026-10-30 技术债状态复核](../audits/2026-10-30-technical-debt-followup.md)。

弹窗结构化与遗留治理进展：
1. `AdminModal`、`Cheatsheet`、`StorageModal`、`PromptTemplatesModal` 与 `ResearchReportDialog` 全面接入 `FoundationDialog`，统一由 Base UI 拥有弹窗交互、Escape 键盘支持、焦点恢复与无障碍 `role="dialog"` 属性，配合 `data-ui-motion` 实现顺滑的进出场反向动画。
2. `app/legacyBridge.ts` 已改为直接静态符号挂载，消除历史上通过 `window.*` 间接读取本地模块符号的启动顺序隐患（包括 `editUserMessage`、`openAttachmentPicker`、`showToast` 等）；`extensions/index.ts` 显式导出扩展动作。该兼容入口仍在 `main.ts` 启动链中，尚未退役。
3. `attachments/limits.js` 与 `attachments/fileTypes.js` 重构为强类型 TypeScript 模块（`limits.ts` 与 `fileTypes.ts`），清晰定义文件归类类型与能力约束。
4. 10 个轻量遗留 UI 模块全面迁移为类型化 TypeScript：`cheatsheet.ts`、`storage.ts`、`confirm.ts`、`dangerConfirms.ts`、`composerAnim.ts`、`composerLang.ts`、`sendGlyph.ts`、`liveRegion.ts`、`greeting.ts`；清除冗余的转接垫片 `tokens.js` 以及旧版 `cheatsheet.impl.mjs`、`storage.impl.mjs`，消除不必要的动态按需导入与未标注的空 catch 块。
5. 生产打包零警告（0 project warnings）：彻底解决 Rollup 中由于动态按需导入与静态首屏引入冲突导致的模块 chunk 合并警告。
6. KaTeX 数学重新渲染版本计数由 `render/mathRevision.ts` 的模块单例管理；缓存失效与 React 重绘读取同一 revision，不再写入 `window.__socratesMathRenderRev`。
7. `ui/toast.js` 统一重构为类型化 `ui/toast.ts`，修复并兼容毫秒数字直传参数，收窄遗留 JS 资产基线。
8. 确认弹窗、prompt templates、More 菜单、Usage、Share、Profile、sidebar 用户摘要、Composer Tools、附件、session-list 与 Cmd-K 状态分别由 `ui/confirmState.ts`、`ui/promptTemplatesState.ts`、`ui/morePopoverState.ts`、`ui/usageState.ts`、`ui/shareState.ts`、`ui/profileState.ts`、`ui/sidebarUserState.ts`、`ui/composerToolsState.ts`、`ui/attachmentsState.ts`、`ui/sessionListState.ts`、`ui/cmdKState.ts` 持有；十一个相应 window bridge 已删除。

历史阶段验证均为 Chromium + localhost mock API。未以此宣称 Safari / Android / iOS 原生签收或帧率基准。

第三轮 frontend lint（含新 root guard）、生产 build、diff check 均通过；新增依赖安装使用
`--ignore-scripts`。白板回归同时断言无 pageerror、无外部 HTTP 请求，并验证移除消息时编辑器销毁。
分享提示条在手机视口可见，重复兼容挂载保留只读消息与工具行。

白板颜色回归同时核对编辑器段落与其父级文字颜色一致，防止 prose palette 再次渗入。
最终桌面白板与手机只读分享截图人工检查通过；验收副本保存在当前 chat 的 visualizations 目录，
避免后续 Playwright 清理 test-results 时丢失已交付证据。

## 历史：RN 轮次（2026-11-01 至 2026-11-16）

> 以下章节记录 React Native / react-native-web 迁移的历史过程。ADR 0027 之后 React DOM 是唯一
> UI 栈，这些轮次不再定义新代码的写法；新增工作按「DOM 元素 + CSS」迁移并降低 shim 基线。

## RN-1：react-native-web 接入与首页空状态（2026-11-01）

- 方向：`frontend/` 继续做线上 Web 外壳；每轮挑一个模块用 RN 组件重写在 `packages/ui`，换成新 UI 后挂进
  frontend 替换旧组件。原生 Android 客户端按需复用同一批共享包。旧的“与 frontend 像素一致”parity 规则作废。
- 解析：`frontend/vite.config.js` 把 `react-native` 指向 `react-native-web`（0.21.3），`.web.*` 扩展名优先，
  `react` / `react-dom` / `react-native-web` 去重；只为 `@socrates/theme` 与 `@socrates/ui/primitives`、
  `@socrates/ui/home` 两个窄入口建别名，Web 外壳不会引入 `packages/ui` 的完整 barrel。
  `react-native@0.86.3` 只作 devDependency 提供类型，`tsconfig.json` 固定 `types` 防止 `@types/node` 混入。
- Tokens：`packages/theme/src/ui.ts` 是新 UI 的单一来源；`scripts/gen-ui-tokens.mjs` 生成
  `frontend/src/styles/foundations/tokens.generated.css`（themes.css 引用），frontend lint 用 `--check` 防漂移。
  canvas / card 直接复用背景阶梯色值，surface-ladder 守卫期望值不变。
- 基元：`packages/ui/src/primitives`（UiThemeProvider / UiText / UiButton / UiPill / UiCard）。Web 侧传
  `uiColorsCssVars`（`var(--ui-*)`），主题切换由 `[data-mode]` 完成，不触发 React 渲染。
- 样板模块：`packages/ui/src/home`（HomeHero / HomeShortcuts / HomeStarters），frontend 由
  `react/home/HomeStartComponents.tsx` 适配文案与行为，经 `mountOwnedRoot` 挂到 `#homeHero`、
  `#homeQuickActions`、`#homeTutorStarters`。问候语由 `ui/greetingState.ts` 发布，hero 挂载后
  `renderGreeting()` 不再直接写 DOM。e2e 选择器改用 RNW 的 `data-testid`（`home-shortcut-*`、`home-starter-*`）。

## 启动恢复首轮验证（2026-11-02）

- mountRegistry / ownedRoot / pageLoader 共 19 项相关单测通过；本轮新增与扩展注册表恢复用例。
- production build 与 bundle-size 预算通过；TypeScript、ESLint、架构守卫通过（修正新测试截图路径后，重跑该守卫及此前未执行的后续守卫）。已有 3 条非本轮文件的 complexity warning 保留。
- 新恢复场景覆盖浅色桌面、深色中文手机、键盘重试；连同 React compatibility 和非预算类 performance-loading，共 12 项浏览器测试通过，截图已检查。
- 当前 HEAD 源码对照构建也复现 3 项既有失败，不能宣称全量门禁已绿：FoundationMenu 静态依赖链触及 vendor-editor；首屏静态 JS gzip 589936 B，超过 360000 B；blocked-storage 启动观察到 2 次读取，门槛为 1 次。本轮实现的静态闭包增量约 0.7 KB gzip，不调整原门槛。
- 对照构建以构建期 transform 在内存替换本轮变更的生产源码为 HEAD 版本，不回退或 stash 工作区文件；验证后已重新生成当前改动的 production dist。依赖与浏览器环境修复没有修改 package.json / lockfile。

上述三项失败的后续处理见下一节；保留首轮记录，不把后来的结果倒写为历史全绿。

## 静态依赖与启动收敛（2026-11-02）

- Rolldown 不再使用会递归吞并共享依赖的 `manualChunks` 兼容模式；改为显式 `codeSplitting` 分组并禁用依赖递归归组，启用 strict execution order。React 与 Oxc helper 不得归入 editor / tldraw / three；Oxc helper 独立为小型 `vendor-runtime`。保留 preload helper 和 React store shim 的既有归属。
- `specs.tsx` 直接导入轻量适配器，不经 sidebar barrel 将 RN 导航提前拉入主入口。导航、sidebar chrome 与 transcript 在原有启动阶段发起异步导入并预留宿主；不等用户第一次点击，也不串行等待 config / auth。回调核对实际宿主，避免迟到导入挂进替换后的节点；导航失败复用局部恢复入口。
- `diagnosticHost` 和只读 `mountTurn` 保留同步 host/root 接口，通过 Suspense 加载实际视图。诊断提供状态文案；分享工具视图加载或失败时保留可读纯文本，加载后仍由原组件提供声明式工具行。
- `vizStubs` 不再于模块求值时读取 `socrates-viz-view`。偏好在首次查询时读取一次，显式选择优先，未知值或 blocked storage 使用 preview 默认；不增加第二个 storage shim。
- 最终静态 JS 闭包为 **318997 B gzip**，低于原 **360000 B** 门槛；HEAD 对照为 589936 B，下降约 46%。HTML 4599 B、linked CSS 163154 B，静态闭包保留 380 个模块。这里是构建图按独立 gzip 流统计，不是全部首屏请求或 LCP 测量；启动阶段仍会请求必要的异步可见 UI。
- 原三个失败均通过，未调整传输预算或 storage 次数断言。新增断言阻止 React / runtime helper 被重型 vendor 捕获，并要求导航、正文与诊断实现保持非静态加载。
- `streaming-render` 的旧 h3 字重断言仍固定为 600，与 HEAD 在 `f1f8bde0` 已采用的 medium 标题契约冲突。本轮不改 CSS；测试改为验证实际字重等于主题 medium token、仍重于正文，保留标题字号至少比正文大 10% 的检查。
- 验证：完整 frontend lint（仅保留原有 3 条 complexity warning）、生产构建、bundle-size 预算通过；45 项相关单测通过；最终统一执行的 60 项 Chromium 回归全部通过，涵盖 storage、预算、菜单/白板、导航、诊断、发送/停止/重试、流式滚动、分享、兼容挂载和局部失败恢复。已检查浅色桌面、深色中文手机的恢复截图。

未改变 API / SSE / 持久化键、宿主 ID、设计令牌值、样式导入顺序或移动参考密度。下一阶段再按表面与属性推进 token 映射和覆盖清理，不将其与启动依赖改造混成一次视觉重写。

## RN 轮次现状（2026-11-05 整理）

RN-2～RN-14 此前只存在于 commit / PR 标题，本节把它们落成可查的现状；RN-1 见上一节。
轮次号来自分支 `hark/rn-*`，不是连续发布序列：RN-9 是 RN-7 与 RN-8 的合并点，
RN-13 的优化在 RN-14 合入后又做过一次 reconcile（`afb52980`）。

| 轮次 | 主题 | 主要落点 | 现状 |
|---|---|---|---|
| RN-1（#120，11-01） | react-native-web 接入、新 UI tokens、首页空状态 | `frontend/vite.config.js`、`packages/theme/src/ui.ts`、`packages/ui/src/home` | 已签收，见上一节 |
| RN-2（#122，11-01） | 思考展示与工具卡改为 RN | `packages/ui/src/turn`；SPA `react/tool-run/*` | SPA 在用 |
| RN-3（11-01） | 十种学习脚手架 | `packages/ui/src/learn`；SPA `react/tutor-widgets/LearnScaffolds.tsx` | SPA 在用（原 Universal 已删） |
| RN-4（11-02） | 问题链与学习方式胶囊 | `packages/ui/src/think` | SPA 在用 |
| RN-5（11-02） | 知识图谱、诊断、错题本 | `packages/ui/src/study` | SPA 在用 |
| RN-6（#127，11-02） | 学习内容改为 AI 生成、按上下文定制 | `prompts/learning-modes.md`、`server/src/lib/prompts.ts`、`packages/core/src/learningBlocks.ts` | 服务端提示词 + 共享模型，SPA 在用 |
| RN-7（11-02） | 外壳与 tokens：侧栏、顶栏、提问框外壳 | `packages/ui/src/shell`、`/composer`、`look.ts` | SPA 在用 |
| RN-8（11-02） | 内容区视觉：营销站表面 | `packages/ui/src/{learn,turn,study,think,home}` | 并入 RN-9 |
| RN-9（#130，11-02） | 合并 RN-7 / RN-8，统一新 tokens 与图标 | 同上 + `frontend/src/styles/*` | 已签收 |
| RN-10（#131，11-03） | 会话行与分组标题改 RN | `packages/ui/src/shell/ConversationRow.tsx`；SPA `react/session-list/*` | SPA 在用 |
| RN-11（#132，11-03） | 考试、诊断、错题本公式接 KaTeX | `packages/ui/src/study`；SPA `react/exam/*` | SPA 在用 |
| RN-12（#133，11-03） | 诊断行内公式、考试粗体与行内代码、选择题左对齐 | `react/tutor/*`、`render/*` | 修正轮 |
| RN-13（#134，11-03） | 首屏包体 589,909 → 358,308 B gzip | `app/widgetSetup.ts`、`react/message-list/*`、`LazyAssistantTurn` | 后续启动收敛再降至 318,997 B，见上一节 |
| RN-14（#136，11-03） | 自问入链、闪卡间隔复习、跨会话错题、状态色灰阶 | `packages/ui/src/{learn,think,study}`、`react/tutor/*` | SPA 在用 |

接入面（2026-11-05 统计）：`frontend/src` 有 41 个文件、52 处 `@socrates/ui/*` 子路径引用，
分布为 learn-model 10、exam-model 8、turn 6、think-model 5、shell 5、study 4、primitives 4、
exam 3、think 2、learn 2、study-model 1、home 1、composer 1。Web 宿主适配集中在
`frontend/src/react/rn/`：纯 Web 适配层，`WebUiTheme` 用 `var(--ui-*)`
让 `[data-mode]` 切主题不触发 React 渲染，`webHost.ts` 把宿主的结构 class、`title`、
行级 ARIA / 拖拽挂到标准 Web 原语元素上。共享包自己不写 Web class。

**已迁移的整块表面（2026-11-05）**：考试。`packages/ui/src/exam/` 下 8 个文件
（`ExamPanel`、`ExamSetup`、`ExamQuestionList`、`ExamResults`、`ExamStatus`、`ExamNavigation`、
`ExamFooter` 与内部 `controls`），SPA 侧只剩 `react/exam/ExamView.tsx` 适配层和
`src/exam/{screen,copy,adapt}.ts` 纯函数：适配层读 store、把命令转给 `src/exam/*` 的既有
副作用，共享组件不碰 DOM 与 store。旧 6 个 DOM 组件与 `test/harness-exam.mjs` 已删，
`styles/legacy/08-exam.css` 只保留页面外壳与滚动偏移，e2e 断言改用 `data-exam-*` 语义钩子。
**脚手架统一（2026-11-06）**：学习脚手架（十种 scaffold）此前有两套实现——SPA 走
`frontend/src/render/{assistantHtml,scaffoldPipeline}.ts`，Universal App 走自带的
`packages/ui/src/scaffolds.ts` 与 `MessageContent.tsx` 里的本地卡片，两边的"哪一块变成卡片、
哪一块退化成正文、哪一块是坏块"各写了一份。现在只剩一套：
- `packages/ui/src/learn/split.ts` 是唯一的分段与判定（DOM-free），两端共用；
- `packages/ui/src/learn/model.ts` 是唯一的解析，`packages/ui/src/learn/strings.ts` 是唯一的文案；
- `packages/ui/src/learn/` 的 RN 卡片是唯一的呈现：SPA 仍走 slot div + 挂载
  （`frontend/src/render/scaffoldPipeline.ts` + `react/tutor-widgets/LearnScaffolds.tsx`）。
  （Universal App 曾直接内联渲染同一批卡片，2026-11-16 随该 app 删除。）
- 宿主各自的副作用不合并：判分、错题本、向导师追问仍在宿主（SPA `render/widgetRuntime.ts`；
  Universal App 曾用自己的 `useTutorProgress.ts`，现已删除）。
- SPA 的挂载由 `frontend/src/render/widgetScheduler.ts` 负责：转录本是懒挂载的，slot 可能比
  正文晚几百毫秒才进 DOM，所以调度器观察文档直到每个 slot 都挂上（超时 10 秒后放弃），
  而不是按固定帧数重试。
卡片不再画框：外框、发丝线、抬升与标题下的分隔线都去掉，脚手架像正文的一段而不是压在
正文上的盒子；控件（选项行、输入框、胶囊）保留自己的描边，因为那是可交互与状态的提示。
两端都挂了 `UiThemeProvider`（SPA 用 `WebUiTheme`，Universal App 曾用自己的根入口），
共享卡片因此跟随应用的浅色 / 深色与字体，而不是固定浅色。

**仍未迁移的部分（按体量）**

1. **Transcript**：`frontend/src/react/message-list/*` 仍是 DOM + HTML 渲染，正文是直接注入的
   服务端 HTML；共享的 `ChatMessageList` 随 Universal App 一并删除。剩余工作是外壳、工具栏、
   操作行与流式/分享只读链路的逐块替换，正文按 D5 不迁。
2. **富文本输入**：SPA 的编辑器仍是 TipTap（`react/composer-input/RichComposer.tsx`），
   只有外壳与控件栏换成了 RN，编辑器本身不迁。
3. **原生岛**：TipTap、tldraw、HTML/Viz、Mermaid、Three.js 保持 Web 专用，不在迁移范围。

**根入口清理（2026-11-16）**

旧的 barrel `packages/ui/src/index.tsx` 曾与子模块并存两套 `Sidebar`/`ChatMessageList`/`Composer`
实现；Universal App 删除后 barrel 无消费者，已整体移除，`packages/ui/package.json` 只保留子路径
exports。`frontend/scripts/check-ui-entry.mjs` 在 lint 中禁止 SPA 引用根入口，杜绝双轨回流。

**验证边界**

- `ci.yml` 的 Frontend lane 跑 lint、build、bundle 预算、`test:unit`、根 `npm run test:shared`
  与 `test:e2e:required`（smoke + regression + theme）；截图/视觉参考由 `test:e2e:visual`
  单独跑，PR 上仅作提示。Shared lane 跑 Rust protocol 与 core 的 TS conformance。
- 共享包测试：`packages/ui/src` 下 24 个 `*.test.ts`，由根 `scripts/run-shared-tests.mjs`
  逐文件起独立进程执行（resolver 从 `frontend/` 解析 react/zustand/marked）。
- `native-android-build.yml` 手动触发，产出原生 Android 调试 APK 与测试报告，不在合并门禁里。
- Safari 与移动浏览器未纳入 Playwright 覆盖。

**下一步顺序**

设置分类导航和显示页网格开关已接入，后续从字号和内容宽度的分组控件继续。先迁
`packages/ui/src/primitives` 与 `shell`，再按表面逐个删除 `react-web` shim import。约束见
[ADR 0027](../adr/0027-react-dom-only-retire-rn-shim.md)。独立 Android 客户端继续使用 Compose，并共享 API 与核心逻辑。

# UI 结构与迁移边界

更新：2026-10-26。本文描述当前代码的职责、生命周期协议和剩余迁移债务。
历史迁移计划中的旧目录 / 旧工作流不能作为当前入口清单。

## 客户端职责

| 目录 | 当前职责 | 共享与隔离边界 |
|---|---|---|
| `frontend/` | 生产 Vite SPA，视觉与功能基准 | React 渐进接管静态 shell，仍有旧 DOM 业务 |
| `apps/socrates/` | Expo Universal App：Web / Android / iOS | 业务状态、协议和 RN UI 来自 packages；平台适配留在 app |
| `packages/ui/` | Universal 的共享 RN 组件 | DOM-free，不承接 SPA 的 react-dom 组件 |
| `packages/theme/` | 共享 token 与 RN 色值 | SPA 最终调色板由 themes.css 提供 |
| `apps/socrates-android/` | 独立 Kotlin + Compose Android | ADR 0021 例外，共享 `/api/v2` 协议 |
| `site/` | 独立营销和文档站 | 独立部署，静态资源修改要同步 cache-busting 版本 |

`mobile/`、`capacitor/` 已删除。`desktop/dist/` 是 gitignored 导出物，没有源代码归属。

## SPA 入口与依赖方向

```text
index.html                         静态 shell / 挂载宿主 / CSP
  └─ src/main.js                   启动组合，batchStorage.js 必须最先导入
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
- `chat/` 不依赖 React 实现；共享类型可来自 `react/types/`，宿主状态与展示模型留在 ui。
  不通过新增 re-export shim 延长旧路径寿命。
- `auth` 的 `__socratesMountReactCompatibility` 仍是兼容启动通知，保留认证后才加载
  editor / modal 的时序。消息挂载和分享接管的四个 window 字段已由中立模块替代。

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
settings 的首次挂载继续使用 `flushSync`；普通页面仍在导航时挂载。

`lint:react-roots` 已接入 frontend lint。它通过 AST 检查直接 import（含 alias / namespace）、
dynamic import 与退役全局字段；类型 import、注释和字符串不计。
零债务 baseline 的 `--update` 只能缩减，不能为新增路径放宽。

## 页面加载协议

`pageLoader` 用 WeakMap 绑定实际节点，合并同一宿主上正在进行的 import。
加载与挂载分离：import 完成后核对当前 DOM 宿主，替换节点的迟到结果直接退出。
只有初次未挂载的宿主写入 skeleton；加载或刷新失败不会用错误字符串覆盖已有 React 内容。
各调用者的 afterMount 独立执行并处理异步错误，失败后可重试。

注册表在懒加载期间预留宿主，阻止旧 DOM 写入与重复启动；成功后记录完成，失败则报告并释放预留。

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

| 顺序 | 债务 | 处理边界 |
|---|---|---|
| 1 | 旧 DOM 页面、消息 fallback 与 React 并存 | 按功能转移 DOM 写入者，保留老消息兼容读取和回归；继续降低 `.js` / shim ratchet |
| 2 | 部分领域仍使用 window bridge / 自定义事件 | 逐领域换成类型化模块接口，保留认证恢复和启动顺序；不一次改写 main.js |
| 3 | legacy / restore 仍有兼容几何 | 证实 selector 无消费者后删除，缩减 CSS debt，不新增竞争 palette / surface owner |
| 4 | Universal 与 SPA 的功能签收 | 依据迁移计划逐模块验收；截图 fixture 不能替代全部平台、语言和浏览器验证 |

## 验证记录与入口

| 阶段 | 单测 | 浏览器回归 |
|---|---|---|
| 首轮：普通 root | 6/6 | 57 个用例验证；手机 drawer 视口初始化修正后重复 3/3 |
| 第二轮：页面 / 动效 | 14/14 | 88 个不同用例，最终修正交集与布局集 43/43 |
| 第三轮：消息 / 分享 / 白板 | 15/15 | 58 个不同用例：消息/流式集 43/43；最终编辑器颜色与主题/布局集 26/26 |

当前最小单测：ownedRoot、messageSurface、reactRootGuard、mountRegistry。
先 build，再按 diff 跑 message-list-compat、share-view、whiteboard-lifecycle、chat-send、
chat-stop-resend、streaming-render、react-compat、storage-bootstrap 等 Playwright。
frontend lint 包含类型与全部架构护栏；测试截图和报告保持 gitignored。
空 catch 的冻结预算本轮从 299 缩减到 295，已移除的静默清理路径不再保留预算。

历史阶段验证均为 Chromium + localhost mock API。未以此宣称 Safari / Android / iOS 原生签收或帧率基准。

第三轮 frontend lint（含新 root guard）、生产 build、diff check 均通过；新增依赖安装使用
`--ignore-scripts`。白板回归同时断言无 pageerror、无外部 HTTP 请求，并验证移除消息时编辑器销毁。
分享提示条在手机视口可见，重复兼容挂载保留只读消息与工具行。

白板颜色回归同时核对编辑器段落与其父级文字颜色一致，防止 prose palette 再次渗入。
最终桌面白板与手机只读分享截图人工检查通过；验收副本保存在当前 chat 的 visualizations 目录，
避免后续 Playwright 清理 test-results 时丢失已交付证据。

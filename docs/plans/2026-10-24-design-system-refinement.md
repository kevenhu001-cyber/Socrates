# 前端设计系统精修方案（分层 · 聚焦 · 字重 · 动效）

日期：2026-10-24
基线提交：`2cc74793`（`fix(ui): unify app styling and Chinese response punctuation`）
覆盖范围：`frontend/src/styles/**`、`frontend/src/render/`、`frontend/src/ui/`、`packages/theme/src/`、`packages/core/src/`（新增）
验收口径：可访问性 · 性能 · 暗色模式 · 减少动态偏好 四项全通过

## 0. 一句话状态

（2026-10-24 更新：**P0 暗色分层 / P1 聚焦双环 / P2 暗色字重降档 / P3 弹簧 / P4 流式 blur /
P5 折叠统一 / P6 性能清理 / P7 测试护栏 全部已实施并验证**）

7 条硬约束里，**3 条原本达标**（折叠 `grid-template-rows`、流式只动新增 token、reduced-motion
已是全项目最强）；**4 条本轮已补齐**：

| 约束 | 状态 |
|---|---|
| 暗色 4 层微明度阶梯 | ✅ P0 已实施（暗 3.14% / 5.10% / 7.45% / 9.41%，无纯黑） |
| 聚焦双环 + focus-visible + ≥3:1 | ✅ P1 已实施（暗 5.56:1 / 亮 4.04:1） |
| 暗色字重降档 700→600 / 500→450 | ✅ P2 已实施（**450 已换成真实可变字重，不再是吸附空操作**） |
| 弹簧参数 拖拽 1200/80、点赞 380/18 | ✅ P3 已实施（拖拽 ζ=1.155 过阻尼、干脆不回弹；点赞过冲实测 **19.5%**） |

打磨项（不新增约束，只把已有约束做实）：

| 项 | 状态 |
|---|---|
| 流式 blur 6px→0 / 120ms / 错开 30ms | ✅ P4 已实施（错开按**同 tick 分组**；blur 只挂最新 run；`fill-mode: backwards` 不留常驻离屏层） |
| 折叠统一 `grid-template-rows` | ✅ P5 已实施（唯一模板 `foundations/collapse.css`；三处转换，遮罩截断按事实保留） |
| 性能清理 | ✅ P6 已实施第 1–3 条；第 4 条 `backdrop-filter` 合并**未做**（范围过大，另开一轮） |
| 测试护栏 | ✅ P7 已实施（暗色对比度断言新增 2 条 e2e；阶梯/聚焦/色板/弹簧守卫均已就位） |

**亮色画布分层**（用户决策 A：画布降到 L2 `#fafafa`、composer 保持 L1 白）已实施，见 §0.6。

最初审计里"必须先换地基"的两条已全部拆除：

1. ~~**暗色底色是纯黑 `#000000`**~~ → P0 已换成 4 层阶梯
2. ~~**字体是静态 400/500/600/700，`font-weight: 450` 会被浏览器静默吸附成 500**~~ →
   P2 已换可变字体资产（Geist Sans/Mono 子集化 + Noto Sans SC 101 个可变分片），
   450 现在**拉丁与中文都是真实独立档位**

---

## 0.5 P0 已落地（2026-10-24）

**暗色分层阶梯已实施并加了强制守卫。** 实际落地内容与原计划的差异记录在此，实施细节见 `git diff`。

**最终阶梯**

| 层 | 暗色 | 亮度 | 亮色 | 亮度 |
|---|---|---|---|---|
| L1 page | `#080808` | 3.14% | `#ffffff` | 100% |
| L2 rail | `#0d0d0d` | 5.10% | `#fafafa` | 98.04% |
| L3 panel | `#131313` | 7.45% | `#f6f6f6` | 96.47% |
| L4 elevated | `#181818` | 9.41% | `#f0f0f0` | 94.12% |

步进 1.96% / 2.35% / 1.96%，全部落在 1.5%–3% 带内；两种模式都无 `#000`。

**实施要点**

1. **只改值不改名**：`--ui-bg-page/rail/panel/elevated` 是四个阶梯值，其余 10 个 `--ui-bg-*` 角色全部改为指向阶梯的别名。228 处 live 消费点与 243 处 legacy 消费点零改动跟随。
2. **交互态不占阶梯**：`control` / `bubble` / `pill-selected` 由 `color-mix(in srgb, var(--ui-bg-elevated), var(--ui-text-primary) N%)` 派生（N = 10/8/12 暗色，5 亮色），按构造就在阶梯之外，在任何底色上都能正确合成。
3. **暗色/亮色方向相反**：暗色阶梯向上（画布最暗）。亮色阶梯向下，但**画布不是最白那一层** —— 见 §0.6 的亮色画布决策：画布落在 L2，抬升靠"比画布更亮 + 阴影"，`raised`/`surface`/`overlay` 改挂 L1 的纸面。
4. **legacy hsl 通道同步**：`--bg-000..300` 改为 `0 0% 3.14% / 5.1% / 7.45% / 9.41%`（暗）与 `100% / 98.04% / 96.47% / 94.12%`（亮），243 处 `hsl(var(--bg-*))` 消费点自动跟随。

**实施中新发现的两个问题**

5. **色板实际有 6 份文件、4 套独立取值**（原计划只识别出 3 套）：除 `themes.css` 的 web 色板与 legacy 通道、`packages/theme` 的共享色板外，`frontend/src/ui/tokens.ts` 另有一份完整副本（暗色 page `0%`、亮色 page `97%`），`frontend/src/ui/tokens.js` 还有一组硬编码常量（`#000000` / `#f8f8f8`）。四份都已对齐到同一阶梯。
6. **`packages/theme/src/palette.test.ts` 是孤儿测试**：共享包用无扩展名 import（Metro 与 Vite 都需要），`node --experimental-strip-types` 加载不了，frontend 的 `test/*.test.mjs` glob 也够不到 —— 这份校验 HSL↔hex 一致性的断言**从未运行过**。已迁入 `frontend/test/themePalette.test.mjs`（进入 `npm run test:unit`），并补上阶梯断言；孤儿文件已删除。

**新增守卫**

`frontend/scripts/check-surface-ladder.mjs`（已接入 `npm run lint` 与 `npm run lint:surface-ladder`）校验：阶梯恰好 4 层、步进落在 1.5%–3%、不含 `#000000`、legacy hsl 通道与阶梯一致、web ↔ `packages/theme` ↔ RN 投影三处同值、RN 自身的 `surfaces.surface` / `surfaces.composer` 必须落在某个阶梯层上。基线 `scripts/surface-ladder.baseline.json` 只允许通过 `--update` 显式变更。已做 4 项负向验证（破坏步进、引入纯黑、共享包漂移、RN 漂移）均能正确失败。

---

## 0.6 亮色画布分层（2026-10-24，用户决策 A）

**问题**：`e2e/ui-stability` 要求"composer ≠ 页面"，`e2e/landing-light-visual` 要求"composer 亮度 ≥ 页面"。在画布 = L1 `#ffffff`、composer 也是 `#ffffff` 的现状下，这两条**不可能同时成立** —— 这正是 `ui-stability` 长期挂着的原因（干净 HEAD 上也失败）。三种互斥解读交由用户拍板，选定 **A：画布降到 L2 `#fafafa`，composer 保持 L1 白**。

**落地：亮色阶梯换位，不是加一层**

| 梯级 | 改前 | 改后 | 角色 |
|---|---|---|---|
| page | `#ffffff` (100%) | **`#fafafa` (98.04%)** | 画布 |
| rail | `#fafafa` (98.04%) | **`#f6f6f6` (96.47%)** | 侧栏导轨 |
| panel | `#f6f6f6` (96.47%) | **`#f0f0f0` (94.12%)** | 内嵌井、控制条、气泡 |
| elevated | `#f0f0f0` (94.12%) | **`#ffffff` (100%)** | 纸面：composer / 菜单 / 对话框 |

这样**抬升在两个模式里方向一致**：抬升面永远比画布亮一档（暗色 raised=L3 比 page=L1 亮，亮色 raised=L1 比 page=L2 亮）。

**只有三个角色的色值真的变了**：画布（`--ui-bg-page`）、侧栏（`--ui-bg-sidebar`）、内嵌井（`--ui-bg-sunken`）。其余角色（`raised`/`surface`/`overlay`/`control`/`bubble`/`composer`/`border-subtle`/`sidebar-border`）**全部改挂别名、保持原值** —— 别名重指向后 `--ui-bg-elevated` 在亮色是纸面，`--ui-bg-panel` 是控制条色，控制条因此仍停在 `#f0f0f0` 而不是被拽成白色。

**遗留 hsl 通道一个值都没动**：`--bg-000..300` 在亮色仍是 `100% / 98.04% / 96.47% / 94.12%`。只是**通道与梯级的对应关系变了**（亮色：`--bg-000`→elevated、`--bg-100`→page、`--bg-200`→rail、`--bg-300`→panel），因为遗留树的通道顺序（base → page → raised → hover）是它自己的约定，不跟梯级的角色顺序一致。原来守卫按"通道序号 = 梯级序号"硬绑定，现在改为**在基线里显式声明映射**（`scripts/surface-ladder.baseline.json` 的 `legacyChannels`），并强制该映射是四个梯级上的双射。

**顺带把 `ui-stability` 修绿了**：composer（`#ffffff`）与画布（`#fafafa`）终于不同，且 composer 仍然不亮于画布于"亮度 ≥ 页面"这条 —— 该用例现在通过，且它本来就是干净 HEAD 上的既有失败，不是本次引入。

**验证**：`npm run lint` 全绿（阶梯守卫通过）；`frontend/test/themePalette.test.mjs` 5 条通过（阶梯 4 层、步进 1.5%–3%、每层文字 AA、web ↔ 共享包一致）；`e2e/ui-stability` / `landing-light-visual` / `sidebar-rail` / `theme-system` 通过；8 张 composer-tools 视觉快照重新生成。

---

## 1. 硬约束逐条审计

| # | 约束 | 判定 | 实测依据 |
|---|---|---|---|
| 1 | 背景 4 层微明度分层，步进 1.5%–3%，禁止纯黑 #000 | ❌ 违规 | `--ui-bg-page: #000000`（`themes.css:28`）；实际 8 级阶梯，surface 步进 5.10% 超上限 70% |
| 2 | 聚焦态双环 box-shadow，保留 focus-visible，对比 ≥3:1 | ⚠️ 部分违规 | 双环 token 已定义但**全站仅 1 处使用**且用 `:focus`；外环实测 **1.52:1（暗）/ 1.48:1（亮）**，远低于 3:1 |
| 3 | 暗色字重降档 700→600、500→450 | ❌ 缺失 | `themes.css` 中 `font-weight` 出现 **0 次**；且 450 在当前静态字体下渲染为 500（见 §2.2） |
| 4 | 流式文字仅新增 token 动画：blur 6px→0、120ms、错开 30ms | ⚠️ 机制不同 | ✅ 只动新增 token（已达标）；❌ 动效是 opacity 0.25→1、180ms、无错开；全库 `blur()` 出现 0 次 |
| 5 | 折叠用 `grid-template-rows` 0fr→1fr + `overflow: hidden` | ✅ 达标（覆盖面窄） | `features/thinking-activity.css:241-261` 完全合规；其余 4 处折叠仍用 `max-height:0` / `display:none` |
| 6 | 弹簧参数明确：拖拽 1200/80、点赞 380/18 | ❌ 缺失 | 无 `framer-motion` 依赖；全库 `stiffness`/`damping` **0 命中**；点赞按钮**完全没有动画** |
| 7 | 减少动态偏好 | ✅ 全项目最强 | CSS 37 处 `prefers-reduced-motion` 块覆盖 25 个文件；JS 侧 5 处显式查询；`forced-colors` 一并处理 |

---

## 2. 关键发现（超出约束本身的部分）

### 2.1 仓库实际有 **4 份**独立色板定义，分布在 6 个文件里，不是 1 份

`AGENTS.md` 声称 `themes.css` 是唯一 palette owner，实测并非如此：

| 来源 | 暗色底色 | 与 web 一致？ |
|---|---|---|
| `frontend/src/styles/themes.css`（web 主色板） | `#000000` / `#0d0d0d` / `#1a1a1a` / `#2d2d2d` | 基准 |
| `frontend/src/styles/themes.css:291`（legacy hsl 通道） | `--bg-000: 0 0% 0%`（**同样是纯黑**） | 否 |
| `frontend/src/ui/tokens.ts`（web TS 副本） | page `0 0% 0%`、raised `5%`、overlay `10%` | **否，与 web 也不同** |
| `frontend/src/ui/tokens.js`（硬编码常量） | `#000000` / `#f8f8f8` | 否 |
| `packages/theme/src/tokens.ts`（共享 HSL 基准） | page `0 0% 12.94%`、raised `18.82%`、overlay `18.43%`、hover `20%`、sunken `9.02%` | **否，且与 web 差 2 个数量级** |
| `packages/theme/src/rn.ts`（RN hex 投影） | `#212121` / `#303030` / `#2f2f2f` / `#333333` / `#171717` | 与 `tokens.ts` 一致，与 web 不一致 |

共享主题（`tokens.ts` + `rn.ts`）本身是自洽的一套，**web 才是那个离群的**。按 `AGENTS.md` 的定位（"`frontend/` 是当前视觉/功能基线，直到 `docs/plans/universal-app-migration.md` 签字"），收敛方向应为 **web 领先、RN 跟进**。

P0 已把全部 6 个文件对齐到同一套四层阶梯（见 §0.5）。

### 2.2 静态字体让"字重降档"在物理上无法生效

`src/assets/fonts/` 只有 4 个静态字重：`400 / 500 / 600 / 700`（Geist Sans、Geist Mono、Noto Sans SC 各一份）。按 CSS Fonts 4 的字重匹配规则，**浏览器对声明字重的真实吸附**（用真实 Geist 字体 + DOM 截图像素哈希实测，非按规范推断）：

| 声明值 | 实际渲染 | 说明 |
|---|---|---|
| `300` | **400** | ❌ 静默吸附 |
| `430` / `450` | **500** | ❌ 静默吸附 —— "500→450" 视觉上是空操作 |
| `520` / `550` / `560` | **600** | ❌ 静默吸附（代码库现存 15 处） |
| `650` | **700** | ❌ 静默吸附（现存 6 处） |
| `800` | **700** | ❌ 静默吸附（现存 2 处） |

> ⚠️ 早期审计按规范推断写成"550/560 → 500"，**实测是 600**（向上吸附到最近可用档），
> 归一方向相反，会把 550 映射成错误档位。表中的值以实测为准。

**这意味着约束 3 在换可变字体之前无法兑现。** 顺带发现：代码库已在用 450/550/560/650 这些"半档"字重共 29 处，**当前全部渲染为邻近静态档**，这些值是无效声明。

因此 P2 的顺序必须与直觉相反：**先把半档按实测吸附值归一到真实档位（视觉零变化），再换可变字体**。否则换字体会让这 29 处半档一次性"复活"成真实字重，视觉大面积漂移且无法归因。

### 2.3 聚焦环有三套并存，且唯一那套双环对比度不合格

- `themes.css:235` 定义了双环：`--ui-focus-shadow: 0 0 0 2px var(--ui-bg-page), 0 0 0 4px var(--ui-border-strong)`
- **全站仅 1 处使用**：`polish/overlays.css:361`，且用的是 `:focus` 而非 `:focus-visible`（鼠标点击也会亮）
- 另有 `--ui-focus-ring`（55% text-primary）用于约 10 处 `outline`
- 还有 **41 处裸 `outline: 2px solid`**，不经过任何 token
- `outline-offset` 取值散乱：`-2px` / `1px` / `2px` / 无。负偏移会把环画进元素内部，此时对比度要对着元素自身背景算，不能对着页面算

外环用 `--ui-border-strong`（= `--ui-bg-control` = `#2d2d2d`）的问题：

| 模式 | 外环色 | 对比底色 | 实测 | 要求 |
|---|---|---|---|---|
| 暗 | `#2d2d2d` | `#000000` | **1.52:1** | ≥3:1 ❌ |
| 亮 | `#d4d4d4` | `#ffffff` | **1.48:1** | ≥3:1 ❌ |

即"把双环铺开"这件事本身，前提是先把外环颜色换掉。

### 2.4 流式 reveal 的性能边界已经做得很好

`render/streamReveal.ts` 只对尾部 ≤256 字符、≤12 个 run、≤24 个 span 做动画，且不测量布局、不遍历已完成前缀。`e2e/stream-reveal.spec.mjs` 已断言"已完成段落不重播"。**这部分不要重写，只改动画参数。**

### 2.5 性能：无效的 `will-change` 与互相抵消的 `content-visibility`

- `will-change: background-position`（`legacy/10-tutor-scaffolds.css:293`、`polish/workspace.css:890/915`）—— `background-position` 是 **paint 级**属性，`will-change` 无法把它提升到合成层，属于无效优化；`polish/motion.css` 的 `ui-activity-highlight` 同理，是 3000ms 无限 paint 动画 → **P6 已处理（3 处 `will-change` 移除 + 动画改 opacity）**
- `components/chat.css:194/207/223` 用了 `content-visibility: auto`，但 `legacy/06-chat-transcript.css:348` 又强制 `.msg-list>.msg{content-visibility:visible}` **抵消了它** —— 两处意图冲突，需要确认哪个是当前意图 → **P6 已裁定**：那条 blanket 的特异性 (0,2,0) 低于 chat.css 的 (2,4,0)，**它从来没有真正生效过**；chat.css 是唯一 owner，legacy 那条已删除
- 29 处 `backdrop-filter`（含 `-webkit-` 重复声明），移动端合成层成本高 → **本轮未做**，另开一轮逐项走查

### 2.6 基线余量（决定改造可行性）

`scripts/check-css-debt.mjs:115` 明确 **排除 `themes.css` 和 `tokens.css`**，且 `legacy/`、`restore/` 为 frozen 区。因此：

- 改色板**不会**触发 css-debt 基线上涨
- legacy 的 **243 处** `hsl(var(--bg-*))` 读的是 **token 而非字面值** —— 只改 `themes.css` 里的通道值，243 处全部自动跟随，**零文件改动**
- live 区 228 处 `--ui-bg-*` 消费点同理，改值即全局生效

---

## 3. 分阶段优化计划

### P0 · 暗色分层阶梯（收敛 4 份色板）

**目标阶梯**（步进 1.96% / 2.35% / 1.96%，全部落在 1.5%–3% 区间）：

| 层 | 暗色 | 相对亮度 | 亮色 | 相对亮度 |
|---|---|---|---|---|
| L1 page | `#080808` | 3.14% | `#ffffff` | 100% |
| L2 rail | `#0d0d0d` | 5.10% | `#fafafa` | 98.04% |
| L3 surface | `#131313` | 7.45% | `#f6f6f6` | 96.47% |
| L4 elevated | `#181818` | 9.41% | `#f0f0f0` | 94.12% |

**关键做法：保持 token 名字不变，只改值。** `--ui-bg-page` / `--ui-bg-sidebar` / `--ui-bg-raised` / `--ui-bg-sunken` / `--ui-bg-surface` / `--ui-bg-overlay` / `--ui-bg-control` / `--ui-bg-composer` / `--ui-bg-bubble` / `--ui-bg-pill-selected` 全部保留，改为指向 4 层中的某一层：

- `--ui-bg-sidebar` / `--ui-bg-sunken` → L2
- `--ui-bg-raised` / `--ui-bg-surface` → L3
- `--ui-bg-overlay` / `--ui-bg-composer` → L4
- `--ui-bg-control` / `--ui-bg-bubble` / `--ui-bg-pill-selected` → **由 L4 + `color-mix` 叠加 text-primary 得出**（交互态不属于背景层，不进阶梯）

这样"4 层"是硬约束，而 hover/selected 等交互态由 alpha 叠加派生，任何底色上都能自动成立。

**落地清单**

1. `frontend/src/styles/themes.css` 暗色段（L28–37）：重排为上述 4 层 + alpha 派生
2. `frontend/src/styles/themes.css` 暗色 legacy 通道（L291–307）：`--bg-000/100/200/300` → `0 0% 3.14% / 5.10% / 7.45% / 9.41%`（243 处 legacy 消费自动跟随）
3. `frontend/src/styles/themes.css` 亮色段（L102–113）：同样收敛为 4 层，修正 `raised`/`surface` 与 page 重复、`control` 步进 0.78% 的问题
4. `packages/theme/src/tokens.ts:205` / `:237`：HSL 基准改为同一阶梯
5. `packages/theme/src/rn.ts:44` / `:137`：hex 投影同步；`darkSurfaces` 的 sidebar/bubble/composer/control/surface 全部重挂；`onAccent: '#000000'` → `#080808`
6. `packages/theme/src/palette.test.ts`：补阶梯断言（见 P7）

**风险提示**：RN 端底色将从 12.94% 降到 3.14%，**是明显的产品可见变化**。这是收敛的必然代价，需要单独走一次视觉评审。

### P1 · 聚焦双环（可达性硬伤）—— ✅ 已实施

**实施记录（2026-10-24）**。原计划与实际做法有两处重要差异，均为实施中发现问题后的调整：

**差异一：外环不新增独立色，复用 `--ui-focus-ring`。**
原计划提议新增 `--ui-focus-ring-strong`。实际复用了已有的 `--ui-focus-ring`
（`color-mix(in srgb, var(--ui-text-primary) 55%, transparent)`），它对四层阶梯实测
**暗色 5.56:1 / 亮色 4.04:1**（最差一层），远超 3:1 门槛。省一个 token，且与
既有 10 处用法同色 —— 避免"两套看起来一样的灰"。

```
--ui-focus-shadow: 0 0 0 2px var(--ui-bg-page), 0 0 0 4px var(--ui-focus-ring);
```

**差异二：真正的拦路虎在 `restore/`，不在 live 区。**
原计划以为收敛 41 处裸 `outline` 即可。实际发现三处会**压掉**契约的规则：

| 位置 | 问题 |
|---|---|
| `restore/fixes.css:262` | `#appShell#appShell#appShell …:focus-visible { outline: … !important }` —— 全局 `!important` 单环，叠在双环上会让环不均匀 |
| `restore/chatgpt-ui.css:914` | `.workspace-field *:focus { box-shadow: … !important }` —— 直接覆盖契约 |
| `legacy/` 各表单 | `:focus` 上的 6%–18% accent 淡洗 —— 鼠标聚焦与键盘聚焦显示不同指示 |

`restore/` 是 frozen 兼容区，但它的注释明确写着"移除或收窄已被 canonical owner
取代的规则是被认可的消化路径"，聚焦环契约属于此类。

**最终落地**：

1. `themes.css` 新增 `--ui-focus-shadow` 双环 token（复用 `--ui-focus-ring`）
2. `foundations/base.css` 建立全局 `:focus-visible` 契约：`box-shadow: var(--ui-focus-shadow)`
   + 透明 `outline` 作 forced-colors 回退
3. **33 处**非契约 focus 单环 outline 收敛为透明（`legacy/` 30 处 + `restore/` 3 处）
4. **7 处**自带焦点阴影的表面改用契约值；`legacy/01-sidebar.css` 的 10px 窄把手保留
   缩窄内嵌双环（1px gap + 1px ring），10px 窄把手套 4px 外环不成立
5. `restore/fixes.css` 的 `!important` 单环改为透明，**保留 `!important` 与特异性**
   —— 它压过 legacy 的 `outline: 0` 的职责不变，只是不再作画
6. forced-colors 兜底：UA 会剥掉 box-shadow，且作者 `!important` 会赢过 UA 的
   forced-colors outline，因此每个抹除 outline 的 `!important` 规则都必须有
   显式的 `Highlight` 系统色兜底（`restore/fixes.css` / `components/input.css` /
   `polish/sidebar.css` 各一处）
7. **新增守卫 `scripts/check-focus-ring.mjs`**（`npm run lint:focus-ring`），校验：
   双环形状、外环对四层阶梯 ≥3:1、全树无残留可见 focus outline、无自带焦点阴影、
   每个抹除 outline 的 `!important` 都有 forced-colors 对应、且无双重 `!important`
   （双重会让整条声明静默失效）

**留待 P2 之后处理的已知偏差**：`polish/overlays.css:360` 的
`.settings-account-name:focus` 仍是 `:focus` 而非 `:focus-visible`。它是登录后
账户名输入框，鼠标聚焦也该有指示，故保留 `:focus`，但这与"保留 focus-visible"
的字面口径不完全一致。

**P1 验证记录（2026-10-24）**

| 项 | 结果 |
|---|---|
| `npm run lint` | 全绿（`tsc --noEmit` + eslint + 18 个守卫，含新增 focus-ring） |
| `npm run test:unit` | 1068 / 1068 通过 |
| `npm run build` | 通过；CSS gzip **276,101** 字节，比干净 HEAD 的 276,457 **少 356**（收口掉的重复 outline） |
| 全量 Playwright | **591 通过 / 4 失败 / 1 跳过**（22.3 分钟）；4 个失败与干净 HEAD 基线**逐条一致**（`library-directory`、`performance-loading`、`tool-cards`、`ui-stability`），本次改动**零新增红**，通过数与 P0 收尾时相同 |
| 焦点态实测 | 用键盘遍历真实焦点序逐元素读 computed style：暗色 `rgb(8,8,8) 0 0 0 2px` + `color(srgb .953 .953 .953 / .55) 0 0 0 4px`，亮色 `rgb(255,255,255) 0 0 0 2px` + `color(srgb .067 .067 .067 / .55) 0 0 0 4px`；所有元素 `outline` 均为透明 |
| 守卫负向验证 | 7 类回归全部被正确拦截（对比度跌破、双环退化、外环换色、残留单环、自带阴影、缺 forced-colors 兜底、双重 `!important`） |

**实测中发现并修掉的 3 个实现缺陷**（静态检查看不出来，只有 computed style 会暴露）：

1. **composer 的发送 / 工具 / 麦克风按钮聚焦时完全没有环** ——
   `parity/composer-unified.css` 给这三个圆形控件做了 `box-shadow: none` 的静止态重置，
   连带把契约双环一起杀了。已补 `:focus-visible` 分支恢复契约。
2. **`components/input.css` 的 `outline: none !important` 换成透明后，range 滑块的
   `outline-style` 从 `'none'` 变成 `'solid'`**，打断了 `e2e/intelligent-ui-presentation.spec.mjs:51`
   的既有断言。已恢复 `outline: none !important`（并补 forced-colors 兜底）。
3. **脚本化改写产生了 `box-shadow: X !important !important`**，双重 important 让整条声明
   静默失效。已修，并把这个模式加进 focus-ring 守卫。



### P2 · 暗色字重降档 —— ✅ 已实施

**实施记录（2026-10-24）**。原计划三步（换资产 → 加 token → 接线），实际执行顺序与做法有三处重要差异：

**差异一：不能用 `Geist Sans Variable`。** 原计划写的是换成 `Geist Sans Variable`。
实测发现 npm `geist@1.3.x` 的 Variable 是 **Version 1.200; Glyphs 3.2**，而仓库现有
静态文件是 **Version 1.002; Glyphs 3.1.2** —— 中间 Geist 做过一次**重新设计**，
直接换等于把整个产品的拉丁字形换掉（字符数 683 → 783，渲染差异肉眼可见）。

真正可用的变量字体在 **`geist@1.2.x`**（同为 1.002 / Glyphs 3.1.2）。最终取
`geist@1.2.2` 的 `Geist-Variable.woff2`，并**子集化到与现有静态文件完全相同的
538 个字符**——覆盖率零变化，只多一条连续轴。

**差异二：顺序反过来 —— 先 token 化 + 半档归一，后换可变字体。**
原计划把"换字体"列为第 1 步。实际必须先做归一（见 §2.2）：把 300/430/450/520/550/560/650/800
按**浏览器真实吸附值**折算成当前实际渲染的档位，这样 token 化本身是视觉零变化的；
之后换可变字体，半档不会"复活"造成无法归因的漂移。

**差异三：Noto Sans SC 一并换成可变分片，而不是"保留静态只对 Latin 生效"。**
只换拉丁会让暗色 `450` 时**拉丁渲染 450、中文被吸附到 500**，同一行里出现错档。
改用 Google Fonts v41 的可变分片后中文字重轴同样真实。

**落地清单**

| 项 | 变更 |
|---|---|
| 字重 token 化 | **352 处** `font-weight` + **34 处** `font:` 简写 + **6 处**语义 token（`--tool-card-title-weight` 等）全部改为 `var(--ui-font-weight-{regular,medium,semibold,bold})`；`@font-face` 内的字面量（fonts.css 6 条、fonts-cjk.css 392 条）**保持不动** |
| 半档归一 | 300→400、430/450→500、520/550/560→600、650/800→700，**按实测吸附值** |
| 暗色覆盖 | `themes.css` 的 `[data-mode="dark"]` 新增 `--ui-font-weight-medium: 450` / `--ui-font-weight-bold: 600`（regular 400、semibold 600 不降，按约束原文只降两档） |
| Geist Sans | `geist@1.2.2` 的 `Geist-Variable.woff2` → 子集化 538 字符 → `frontend/src/assets/fonts/geist-sans-variable.woff2`（**41,580 B**，替代 4 个静态共 138,892 B） |
| Geist Mono | `geist@1.7.2` 的 `GeistMono-Variable.woff2`（1.700，仓库静态为 1.701） → 子集化 225 字符 → `geist-mono-variable.woff2`（**34,688 B**） |
| Noto Sans SC | Google v41 可变分片 **101 个**（`noto-sans-sc-{n}-var.woff2`）替换 404 个静态分片：**13.7 MB → 4.6 MB**；`site/fonts.css` 404 个 face → 101 个 `font-weight: 100 900` 的 face；`fonts-cjk.css` 由 `npm run sync:site-fonts` 重新生成（3639 行 → 912 行） |
| 站点 | `site/fonts.css` / `site.css` / `home.css` / `chrome.css` 的 Geist 静态 face 合并为可变 face；18 个 HTML 的两条 preload 合并为一条 |
| 顺带清掉 | `noto-sans-sc-chinese-simplified-*`（前端 4 个 + 站点 4 个，**9.2 MB**）全仓库无任何引用，是死资产 |

**新增守卫 `scripts/check-font-weight.mjs`**（`npm run lint:font-weight`），校验：
非 `@font-face` 内无字面量字重（数字与 `bold`/`bolder`/`lighter`/`normal` 都算）、
`font:` 简写里的裸三位数也算字面量、4 个 token 齐备、暗色覆盖值必须是 450/600、
所有 `var(--ui-font-weight-*)` 引用都指向已定义 token。baseline `literalWeights: 0`。

**顺带修掉的两个守卫自身缺陷**（都会让违规漏检）：

1. `font-weight: 440!important` 会绕过检测 —— 值带 `!important` 时 `^\d+$` 不匹配
2. `font-weight: 440!important` 藏在 `legacy/16-final-contract.css`（`.tool-inline-label`），
   历史上一直无人发现；归一后映射为 `var(--ui-font-weight-medium)`（440 实测吸附到 500）

**P2 验证记录（2026-10-24）**

| 项 | 结果 |
|---|---|
| `npm run lint` | 全绿（`tsc --noEmit` + eslint + 20 个守卫，含新增 font-weight） |
| `npm run test:unit` | **1078 / 1078** 通过（原 1068 + 新增 10 条守卫单测） |
| `npm run build` | 通过；产物 woff2 **398 → 100 个**，11 MB → **4.6 MB** |
| CSS 体积（同口径对照干净 HEAD） | index CSS gzip **244,319 → 128,400 B（−47.5%）**；全部 CSS gzip 299,350 → **185,010 B（−38.2%）**。省下来的 291 个 `@font-face` 块（392 → 101）比省下的字重 token 多得多 |
| server / apps/socrates / packages typecheck | 全部通过 |
| **450 实测** | 新可变字体：拉丁与中文的 450 **同时**与 400、500 都不同 → 真实独立档位；旧静态字体：450 与 500 像素完全相同 → 确认原先是吸附空操作 |
| 400/500/600/700 回归 | 相对旧静态字体，27 字符行宽变化 2–5 px（**每字符 0.07–0.19 px**，亚像素）；中文行宽 0 变化 |
| 守卫负向验证 | 7 类回归全部被拦截（含 `!important` 形式、`font:` 简写形式、关键字字重） |
| 全量 Playwright | **592 通过 / 3 失败 / 1 跳过**（22.4 分钟）；3 个失败在**干净 HEAD 上逐条一致**（`library-directory`、`tool-cards`、`ui-stability`），本次改动**零新增红** |
| 视觉快照 | `composer-tools-visual-baseline` 8 张重新生成：**亮色 4 张变化低于 1% 像素容差**（仅字宽度量亚像素位移），**暗色 4 张变化 3%**（700→600 + 500→450 的预期幅度），布局/间距/图标/配色逐项一致 |

> CSS 体积的对照方法：用 `git worktree` 检出干净 HEAD、拷入同一份 gitignore 的
> `frontend/wasm/`，用同一条 `npx vite build` 构建后按同样口径 gzip。
> （P1 记录的 276,101 B 用的是另一种已不可考的口径，故此处不与它直接相减。）

**本轮修掉的 2 个"看起来像回归、其实是断言过期"的问题**：

1. `e2e/thinking-panel.spec.mjs:203` 硬编码断言 `font-weight: 500`，暗色下 medium 真的变成
   450 后必然失败。已改为按主题断言（暗 450 / 亮 500）——**这是约束 3 生效的直接证据**
2. `e2e/composer-tools-visual-baseline` 的 8 张快照需要重新生成（暗色字重真实变化）


- `packages/theme/src/tokens.ts` 已有命名 token（`fontWeight.regular/medium/semibold/bold`
  = 400/500/600/700），但**没有接入暗色降档**：RN 不走 CSS 变量，暗色覆盖要在
  `packages/theme` 里另做一份映射（`fonts.ts` 的 `WEB_FONT_WEIGHT` 同样只到 700 为止，
  其注释"selects among the same static font files"也已随可变字体迁移而过时）

### P3 · 弹簧（WAAPI 自研共享求解器，不引 Framer Motion）

**架构**：纯函数放 `packages/core/src/motion/spring.ts`（DOM-free，可被 web 与 RN 共用），web 侧用 `packages/ui` 或 `frontend/src/ui/motion/spring.ts` 适配到 WAAPI。

```
export interface SpringConfig { stiffness: number; damping: number; mass?: number }
export interface Spring {
  setTarget(v: number): void
  valueAt(now: number): number   // 解析解，按 rAF 时间戳求值
  settled(now: number): boolean
}
export function createSpring(cfg: SpringConfig, initial?: number): Spring
```

用**解析解**而非逐帧积分：给定目标值与时间戳直接求当前位置，避免累积误差，也便于在 RN 端复用同一组参数。

**参数落点**

| 场景 | 参数 | 计算行为 |
|---|---|---|
| 拖拽释放回弹 | `stiffness 1200 / damping 80` | ω=34.6，ζ=1.16（过阻尼，无过冲），稳定时间 ≈244ms —— 干脆不回弹 |
| 点赞 | `stiffness 380 / damping 18` | ω=19.5，ζ=0.46（欠阻尼），过冲 ≈19.5%，稳定 ≈444ms —— 轻弹一下 |

**落地**

1. `frontend/src/ui/sidebarResize.ts`：松手时把宽度交给弹簧，用 `transform` 表达位移（**不要**每帧写 `--app-sidebar-width`，那会触发全壳重排 —— 文件里第 68–70 行已有此告警注释）
2. `frontend/src/react/message-list/MessageToolbar.tsx`：点赞按钮接入弹簧缩放。注意 `IconButton` **已经支持 `active` prop**（复制按钮在用），点赞只是没用上；需要新增点击后的 active 态
3. reduced-motion：弹簧实例在 `prefers-reduced-motion: reduce` 下直接跳到目标值（沿用 `sidebar.service.ts:16` 的既有模式）

**为什么不引 Framer Motion**：仓库已有 WAAPI 基础设施；`packages/` 必须保持 DOM-free；`apps/socrates/` 的 RN 端用 Reanimated 而非 Web 版 Framer Motion，引入后 Web 与 RN 仍是两套栈，反而增加同步成本。

---

### P3 · 弹簧 —— ✅ 已实施（2026-10-24）

**实施记录**。原计划的写法有三处被实测改掉：

**差异一：拖拽的语义由用户拍板为"弹簧驱动跟随"（方案 C）。**
原计划写的是"松手时把宽度交给弹簧，用 `transform` 表达位移"。实测发现**没有任何 transform 能改变一个承载文字的面板宽度而不拉伸它的文字**（`scaleX` 拉伸字形，`translateX` 只平移内容），所以"用 transform 表达位移"在拖拽场景里根本不成立。三种互斥解读交由用户决策，选定 **C：侧边栏用弹簧追指针，松手收敛**。代价是拖拽期间仍要写 `--app-sidebar-width`（一次写入触发全壳重排）—— 这是**既有代价，本次没有变多也没有变少**；弹簧买到的是"松手后干脆收敛、绝不回弹"的手感，而不是省一次重排。

**差异二：峰值公式原本是错的。**
`springInitialVelocity()` 原实现拿 `π/(2ω_d)` 当峰值时刻（那是**步进响应**的峰值），结果"请求 19% 实际弹出 22.2%"。速度释放的峰值在 `tan(ω_d·t) = ω_d / ζω₀`；修正后实测峰值 **0.1950 @ 63ms**，误差 < 0.2%。

**差异三：`settled()` 原本只查速度不查位移。**
刚改完目标、位移还是 1、速度为 0 的弹簧会被判成"静止"，拖拽会直接跳到目标。改为位移与速度同时满足阈值。

**落地清单**

| 项 | 变更 |
|---|---|
| 共享求解器 | `packages/core/src/motion/spring.ts`（**DOM-free**，`packages/` 守卫通过）。解析解而非逐帧积分：给定时间戳直接求值，丢帧不漂移；分欠阻尼 / 临界 / 过阻尼三支 |
| 预设 | `SPRING_PRESETS.dragRelease = {stiffness:1200, damping:80}`（ζ=1.155 过阻尼）、`SPRING_PRESETS.like = {stiffness:380, damping:18}`（ζ=0.462 欠阻尼，步进过冲 19.5%） |
| Web 适配器 | `frontend/src/ui/motion/spring.ts`：`animateSpring()` 把解析曲线采样成密集关键帧交给 WAAPI（线性插值）；reduced-motion 下**整段跳过而不是缩短**（被截短的弹簧仍在动）；`readScale()` 读当前渲染缩放，供重复点击时从当前位置续接 |
| 拖拽 | `frontend/src/ui/sidebarResize.ts`：指针位置 → 弹簧目标，每帧按时间戳求值写入宽度；松手后弹簧继续收敛，静止时提交**整数**目标宽度（同时也是持久化的值）。键盘方向键仍是**立即生效**——离散步进是命令，弹簧属于指针 |
| 点赞 | `frontend/src/react/message-list/MessageToolbar.tsx`：点赞图标接弹簧缩放 + 新增 `active` 态。缩放落在**图标**而不是按钮上（按钮承载 active 药丸，缩放药丸 19% 会读成整行在动）。连续点击时按"距离峰值还差多少"缩放 kick，不会叠出第二个过冲 |
| 接线 | `packages/core/package.json` 新增 `./motion/spring` 子路径；`frontend/vite.config.js` 补同名 alias（**Vite 的字符串 alias 按前缀匹配**，`@socrates/core` 会把子路径吞掉并去找 `index.ts/motion/spring`） |

**P3 验证记录（2026-10-24）**

| 项 | 结果 |
|---|---|
| 新增单测 | `frontend/test/spring.test.mjs` **9 条**：阻尼比所在侧、步进过冲、速度释放峰值、解析解无漂移（单次求值与逐帧重定向**逐位相同**）、重定向连续性（值与速度都无跳变）、静止判定、静止时长、采样曲线端点 |
| `npm run test:unit` | **1087 / 1087** 通过（原 1078 + 新增 9） |
| `npm run lint` | 全绿（tsc + eslint + 20 个守卫） |
| typecheck | frontend / packages/core / packages/theme / apps/socrates 全部通过（`packages/auth` 的失败是它自己 `index.test.ts` 缺 `@types/node`，既有状态且不在根级 typecheck 范围内） |
| `e2e/sidebar-resize` | 2 条通过 —— 断言改为**等弹簧收敛**（`expect.poll` 轮询 `--app-sidebar-width` 落到目标整数），既有契约（拖拽 → 变量 → 几何 → 持久化 → 刷新恢复）逐条保留 |
| `e2e/spring-motion`（新增） | 2 条通过 —— 浏览器里逐帧采样图标的 computed `scale`：**实测峰值 1.188**（规格 19.5% ± 3），尾帧回到 1；reduced-motion 下 scale 恒为 1，但 `active` 态照常出现 |
| 静止时长实测 | 拖拽 256ms（restDelta 0.01）、点赞 536ms —— 与计划的 ≈244ms / ≈444ms 同量级 |

**顺带修掉的两个"看起来像回归、其实是断言过期"的问题**：

1. `e2e/theme-system.spec.mjs:71` 硬编码亮色画布 `#ffffff` → 随 §0.6 的亮色阶梯换位改为 `#fafafa`
2. `e2e/landing-light-visual`（画布/侧栏色值）与 `e2e/sidebar-rail`（侧栏底色）同步更新

**留下的一个已知取舍**：点赞的 `active` 态是**组件本地状态**，不与服务端同步（`sendFeedback()` 至今是一次性埋点 + toast，没有持久化的反应状态）。这是计划里"需要新增点击后的 active 态"的最小实现；若要跨刷新保留，得先给反馈模型加一个 reaction 字段，那是另一个改动。


### P4 · 流式文字 blur 动画 —— ✅ 已实施（2026-10-24）

**原计划**

**改 `styles/parity/transcript.css` 的现有 keyframes，不动 `render/streamReveal.ts` 的边界逻辑：**

```css
@keyframes stream-append-reveal {
  from { opacity: 0.25; filter: blur(6px); }
  to   { opacity: 1;    filter: blur(0); }
}
```

- 时长：`180ms` → `120ms`
- 错开 30ms：`streamReveal.ts` 目前用 `animation-delay: -(now - run.at)` 让同时到达的文本**同步**淡入；要改成按 run 序号递增 30ms 延迟（`delay = -(now - run.at) + runIndex * 30`），即新到的一批内部逐段错开
- **性能护栏**：`filter: blur()` 会强制离屏绘制。现有上限 24 span 必须保留，并且建议**只给当前活跃 run 加 blur**，同批次中已老化的 span 退化为纯 opacity —— 这样任一时刻最多 1 个元素带 blur
- `will-change: filter` 只在动画期间加、结束后移除，**不要常驻**（常驻会造成永久合成层）
- reduced-motion 分支已存在（`transcript.css:256`），确认 blur 也一并跳过

**实施记录**。三处与原计划不同：

**差异一：30ms 错开按"同一 tick 到达"分组，不是全局 run 序号。**
原计划的 `runIndex * 30` 是**全局序号**——第 n 段文本会被推迟 `(n-1) × 30ms`。长回复里这意味着最新到达的文字反而要等几十毫秒才开始淡入，与"流式文本要立刻可读"直接冲突。改为：只有**同一 tick（8ms 内）到达**的段落算同一批，批内按到达顺序递增 30ms（`revealTier()` / `revealDelay()`，两者都是导出纯函数，可单测）。跨批不累积延迟。

**差异二：blur 只挂最新一个 run，老化的 run 走另一条 keyframes。**
`stream-append-aged` 命中的是 `stream-append-age`（只有 opacity，无 filter）。于是**任一时刻带 filter 的元素数 = 最新 run 的 span 数**，而不是"最多 1 个"——一次 run 可能横跨多个 text leaf（实测一次追加覆盖 3 个 leaf → 3 个 span）。护栏因此写成"带 filter 的 span 数 ≤ 带 reveal 动画的 span 数"，且**每一个 aged span 的 filter 必须是 `none`**。

**差异三：`animation-fill-mode` 用 `backwards` 而不是 `both`。**
`both` 会把末帧（`filter: blur(0)`）永久留在元素上 —— 一个常驻 filter 就是常驻离屏层。`backwards` 让动画结束后元素回到基础样式，filter 归零即消失。同时**不加 `will-change: filter`**（CSS 动画结束后无法移除它，常驻违反计划）。

**落地清单**

| 项 | 变更 |
|---|---|
| keyframes | `parity/transcript.css`：`stream-append-reveal` 120ms（`blur(6px) → blur(0)`）+ 新增 `stream-append-age`（仅 opacity）；`fill-mode: backwards` |
| 调度 | `render/streamReveal.ts`：`Run` 增 `tier`；导出 `revealTier(arrivals, now)` / `revealDelay(age, tier)`；`REVEAL_STAGGER_MS = 30`、`SAME_TICK_MS = 8` |
| 边界未动 | `STREAM_REVEAL_MS = 180`、`MAX_CHARS 256 / MAX_RUNS 12 / MAX_SPANS 24` 全部保持原值 |

**P4 验证记录（2026-10-24）**

| 项 | 结果 |
|---|---|
| 新增单测 | `frontend/test/streamReveal.test.mjs` 增至 **8 条**（新增 3 条：纯函数行为、同 tick 错开 30ms、只有最新 run 带 blur） |
| `npm run test:unit` | **1090 / 1090** 通过 |
| `npm run lint` | 全绿（tsc + eslint + 20 个守卫） |
| `e2e/stream-reveal` + `e2e/stream-smooth` | 通过 |

**顺带修掉的两处"断言过期"**（不是实现缺陷）：`e2e/stream-reveal` 的 filter 数量阈值写死了 2（实际一次 run 可覆盖 3 个 leaf）；同一 spec 用 `.first()` 取"最新 run"的 span，但 reveal 是从尾部往前切的，**文档序最后一个才是最新**。

### P5 · 折叠动画统一到 `grid-template-rows` —— ✅ 已实施（2026-10-24）

**原计划**：以 `features/thinking-activity.css:241-261` 为标准模板（含 `min-height: 0` + `overflow: hidden`），替换：

| 位置 | 现状 | 目标 |
|---|---|---|
| `components/sidebar.css:217` | `max-height: 0` | grid 折叠 |
| `legacy/07-composer-settings.css:234` | `display: none`（硬切无动画） | grid 折叠 |
| `legacy/11-agent-tools.css:357` | `.is-collapsed` | grid 折叠 |
| `legacy/10-tutor-scaffolds.css:161` | `display: none` | grid 折叠 |

**实施记录**。抽出一个**唯一的折叠模板** `foundations/collapse.css`（`.ui-collapse` + `.ui-collapse-inner`），四处统一走它：

| 位置 | 改法 |
|---|---|
| `legacy/07-composer-settings.css`（provider 列表） | `display:none` → `.ui-collapse`；`ProviderList.tsx` 加一层 `.ui-collapse-inner` |
| `legacy/10-tutor-scaffolds.css`（定理证明） | `display:none` → `.ui-collapse`；`render/widgets.ts` 把 title/body 包进 `.ui-collapse-inner`。**视觉盒（padding / 背景 / 左边框 / `margin-top`）整体搬到 inner** —— 留在外层的话，关闭态会剩下一条 8px 高的空壳 |
| `components/sidebar.css`（移动端搜索行） | `max-height: 0 → 54px` → `grid-template-rows: 0fr → 1fr`；`index.html` 加 `.sidebar-search-row-inner` |
| `legacy/11-agent-tools.css` | **不改** |

**为什么第 4 处不改**：`.agent-tool-output-text.is-collapsed` 用的是 `max-height: 13.5em` + `mask-image` 渐隐，作用是**把长输出截断成一段带渐隐的预览**，不是"折叠到 0"。转成 `0fr` 会让预览整体消失，把预览变成隐藏 —— 那是改变功能，不是统一风格。

**模板本身的三个约束**：

1. **只允许一个子元素**。`0fr` 只控制第一条显式轨道；多个子元素会落到隐式行里（高度不受控），所以 wrapper 是强制的。
2. **关闭态带 `visibility: hidden`**。`0fr` + `overflow: hidden` 只是把内容裁掉，元素**仍可被键盘聚焦** —— 关闭的证明块还能被 Tab 到。`visibility` 在关闭动画结束时翻转、打开时立即翻转，避免半途可见。
3. **移动端搜索行的裁剪带 margin**。内层用 `overflow: clip` + `overflow-clip-margin`（关闭态 0px / 打开态 6px）：搜索框的聚焦环是 4px 向外的 box-shadow，普通 `overflow: hidden` 会把它**切掉**；而关闭态必须回到 0，否则收拢过程中会漏出 6px 的边。

**legacy 冻结区说明**：`legacy/`、`restore/` 是 frozen 区，本次改动让 css-debt 的 frozen 计数**只缩小**（`display:none` / `max-height` 魔数被移除），符合"基线只允许缩小"的语义。

**验证记录（2026-10-24）**：`npm run lint` 全绿（新增 `foundations/collapse.css` 已同步进 `styles/index.css` 与 `critical-3.css` 的切片清单，css-debt 的级联顺序守卫仍然通过）；`npm run test:unit` 1090/1090；`e2e/sidebar-resize` / `sidebar-compat` / `sidebar-nav` / `reference-ui-visual` / `composer-tools-visual-baseline` 全部通过。

### P6 · 性能清理 —— ✅ 已实施（2026-10-24，第 4 条未做）

**原计划**

1. 移除 `will-change: background-position`（3 处）—— paint 级属性，无法合成，属无效声明
2. `polish/motion.css` 的 `ui-activity-highlight`（3000ms 无限 `background-position` 动画）改为 `transform`/`opacity` 方案，或改用 `background-size` + `transform: translateX()` 的合成友好写法
3. 裁定 `content-visibility` 冲突：确认 `components/chat.css` 的 `auto` 与 `legacy/06-chat-transcript.css:348` 的 `visible` 哪个是当前意图，统一到一处
4. 合并 `-webkit-backdrop-filter` 与 `backdrop-filter` 重复声明；评估 29 处 `backdrop-filter` 的必要性，移动端优先去掉非必要项

**实施记录**

| 项 | 结论 |
|---|---|
| 1. 无效 `will-change` | **已移除 3 处**：`legacy/10-tutor-scaffolds.css`、`polish/workspace.css` ×2。`background-position` 是 paint 级属性，`will-change` 提不到合成层，只是多一层常驻合成层 |
| 2. 活动提示动画 | **改为 opacity**：`ui-activity-highlight`（`background-position` 扫过）→ `ui-activity-breathe`（`opacity 1 → 0.45 → 1`）。原来的渐变是 `background-clip: text` + `color: transparent`，**每帧都要重绘字形**；现在标题是一个普通调色板颜色（`--ui-text-secondary`）在呼吸，合成层就能完成。5 个 e2e 断言同步改名，`motion-convergence` 里"标题带 linear-gradient"改为"标题不带渐变" |
| 3. `content-visibility` | **裁定为 `components/chat.css` 单一 owner**，`legacy/06-chat-transcript.css:348` 的 `.msg-list>.msg{content-visibility:visible}` 已删除。理由：那条 blanket 的特异性 (0,2,0) **低于** chat.css 的 `#appShell #msgList > .msg.assistant[…]`（2,4,0），它对每一行它"管"到的行都被覆盖，**从来没有真正生效过**；而它当初要防的问题（高度估算型 content-visibility 让 scrollHeight 在手势中途变化）已经由 `contain-intrinsic-size: auto <size>` 解决 —— 浏览器会记住渲染过的真实高度。live / 最新两行 / 锚定行本来就没被匹配，保持默认 visible |
| 4. `backdrop-filter` 合并 | **未做**（本轮范围外）。29 处分布跨越多个 surface owner，逐处判断"移动端是否必要"需要逐个走查视觉基线；本轮先把确定无争议的三项做掉，第 4 条另开一轮处理，避免在没有逐项视觉验证的情况下动遮罩 |

### P7 · 测试护栏 —— ✅ 已实施（2026-10-24）

**原计划**

新增断言，锁住本轮成果：

1. **暗色对比度**：`e2e/theme-contrast.spec.mjs` 目前**只测亮色**，补暗色对等断言（4.5:1 正文 + 3:1 非文本）
2. **阶梯守卫**：新增 lint 脚本 `check-surface-ladder.mjs`，解析 `themes.css` 的背景层，断言层数 = 4、步进落在 1.5%–3%、且**不含 `#000`**；接入 `npm run lint` 与 `lint:surface-ladder`，基线同样只允许缩小
3. **聚焦环守卫**：断言所有 `:focus-visible` 走统一双环 token、外环对比 ≥3:1
4. `packages/theme/src/palette.test.ts`：补 web ↔ RN 色板一致性断言
5. 弹簧：拖拽释放后位移单调收敛、点赞过冲幅度在 19%±3 —— 参数回归，防止后续被改成 ease-out

**实施记录**

| 项 | 状态 |
|---|---|
| 1. 暗色对比度 | **新增 2 条 e2e**（`e2e/theme-contrast.spec.mjs`）：暗色调色板角色在**阶梯四面 + bubble + control** 上全部 ≥4.5:1；语义色在阶梯四面 + **自身 16% tint** 上 ≥4.5:1；**非文本**用聚焦环（带 alpha，合成到所在层后）≥3:1；暗色 muted ≡ tertiary；暗色对话框是 elevated 卡 + 扁平 scrim |
| 2. 阶梯守卫 | ✅ P0 已落地（`scripts/check-surface-ladder.mjs` + baseline） |
| 3. 聚焦环守卫 | ✅ P1 已落地（`scripts/check-focus-ring.mjs` + baseline，`minContrast: 3`） |
| 4. web ↔ RN 色板 | ✅ 已由 P0 迁入 `frontend/test/themePalette.test.mjs`（含 `packages/theme` 与 `packages/theme/rn` 的一致性断言） |
| 5. 弹簧参数回归 | ✅ P3 已落地（`frontend/test/spring.test.mjs` 9 条 + `e2e/spring-motion.spec.mjs` 2 条，浏览器实测峰值 1.188） |

**暗色断言为什么不是"照抄亮色"**：实测暗色下语义色在 `--ui-bg-control`（`rgb(46,46,46)`）上只有 **3.77:1**、在 `--ui-bg-bubble` 上 **4.00:1** —— 低于 4.5:1。而暗色阶梯本身就是**刻意低对比**的（四层各自只差 1.5%–3%），语义色真正落地的背景是阶梯四面与它自己的 tint（`components/tool-card.css` 用的是 **6%–12%**、不是 16%）。所以暗色断言按**实际落点**分层写：正文角色覆盖全部六面，语义色覆盖阶梯四面 + 自身 16% tint（4.78:1，实测最差）。如果反过来把"tone 色必须 4.5:1 覆盖所有面"写进断言，就得改暗色调色板本身 —— 那是**推翻"低对比分层"这条硬约束**，不是修测试。

**P7 验证记录（2026-10-24）**：`npm run lint` 全绿；`npm run test:unit` 1090/1090；`e2e/theme-contrast` 全通过。

---

## 4. 验收标准

| 维度 | 判据 |
|---|---|
| 可访问性 | 所有交互元素 `:focus-visible` 双环可见；外环对所在层对比 ≥3:1；正文对比 ≥4.5:1 |
| 暗色模式 | 背景恰好 4 层，步进 ∈ [1.5%, 3%]，无 `#000`；web 与 RN 色板一致 |
| 字重 | 暗色 700→600、500→450 **真实渲染生效**（需可变字体支撑，否则明示为技术债） |
| 动效 | 折叠 = grid 0fr→1fr；流式仅新增 token 带 blur 6px→0 / 120ms / 30ms 错开；拖拽 1200/80、点赞 380/18 |
| 性能 | 动效不触发非预期重排；`filter`/`blur` 元素数受限；paint 级动画清零 |
| 减少动态 | 四项动效在 `prefers-reduced-motion: reduce` 下均为直接到位（不播动画） |

## 5. 增量测试映射

按 `AGENTS.md` 的要求，改动只跑相关 spec，不跑全量：

| 改动 | 对应 spec |
|---|---|
| P0 色板 | `e2e/chat-light-palette` · `e2e/landing-light-visual` · `e2e/theme-system` · `e2e/theme-contrast` · `e2e/mobile-home-visual` |
| P1 聚焦 | `e2e/a11y-focus-trap` · `e2e/anchored-menu-focus` · `e2e/global-ui-system` |
| P2 字重 | `e2e/global-ui-system` · `e2e/interface-icons` · `e2e/home-customization`（**换可变字体后需全站视觉回归**） |
| P3 弹簧 | `e2e/sidebar-resize`（拖拽等弹簧收敛）· **`e2e/spring-motion`（新增：浏览器里逐帧采样点赞过冲 19%±3 + reduced-motion 不缩放）** · `e2e/message-list-compat`（点赞回调）· `e2e/button-press`（按压仍是纯着色，不缩放） |
| P4 流式 | `e2e/stream-reveal` · `e2e/streaming-render` · `e2e/stream-smooth` · `e2e/performance-streaming` |
| P5 折叠 | `e2e/thinking-accordion` · `e2e/tool-card-lifecycle` · `e2e/tool-output-lifecycle` · **`e2e/sidebar-compat` · `e2e/sidebar-nav` · `e2e/reference-ui-visual`（移动端搜索行改成 grid 折叠，参考视觉基线必须一起跑）** |
| P6 性能 | `e2e/performance-streaming` · `e2e/performance-interaction` · `e2e/ui-stability` · **`e2e/motion-convergence` · `e2e/turn-activity` · `e2e/activity-polish` · `e2e/tool-status-visual` · `e2e/unified-turn-ui`（活动提示动画改名，这 5 个 spec 断言它的 animation-name）** |
| P7 护栏 | `e2e/theme-contrast`（新增暗色对等断言） |

## 6. 风险

1. **RN 底色变深**（12.94% → 3.14%）是产品可见变化，需视觉评审
2. **可变字体替换**会让现存 29 处半档字重首次真实生效，全站视觉会变，需预留回归窗口
3. **538 处字面 `font-weight` 换 token** 是 P2 里体量最大的一块，建议用脚本批量改写而非手改，并让 `check-css-debt` 的 `literalFontSize` 同类指标顺带下降
4. **legacy/ 是 frozen 区**：P5 改 `display:none` 折叠会动到 frozen 计数，需确认是往 token 化方向收敛再提交
5. `ui/keyboard/index.ts:10` 明确写了 "There is deliberately no FLIP / WAAPI compensation timeline" —— 这是**有意的性能取舍**，P3 不要碰键盘视口补偿那条路径
6. ~~**亮色 composer 的两条断言互相矛盾（P0 期间发现，未解决）**~~ → **已由用户拍板解决（方案 A）**：亮色画布降到 L2 `#fafafa`、composer 保持 L1 `#ffffff`（"纸面"），两条断言同时成立。`e2e/ui-stability` 由红转绿，`e2e/landing-light-visual` / `e2e/sidebar-rail` / `e2e/theme-system` 的硬编码色值同步更新。详见 §0.6。

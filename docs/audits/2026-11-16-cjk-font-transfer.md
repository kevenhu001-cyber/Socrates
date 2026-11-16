# CJK 字体传输：实测与收敛（2026-11-16）

上一轮（[boot-performance-pass-3](./2026-11-16-boot-performance-pass-3.md)）把静态 JS 压到 327,945 B gzip 之后，用真实浏览器重新测量首屏，发现**剩余的最大传输项不是 JS，而是中文字体**。

## 测量方法

`frontend/dist` 由 `e2e/dist-server.mjs` 提供，Playwright Chromium，`locale: en-US` + `localStorage['socrates-lang-app'] = 'zh'`（中文界面），`/api/*` 用 `e2e/_mock-api.mjs` 的 mock（未登录用 401）。这是 origin loopback、未压缩，所以**只读请求清单和字节数，不读时间**。

## 测量结果

| 资源 | 修改前 | 修改后 |
| --- | --- | --- |
| 请求总数 | 78 | **69** |
| 总字节（未压缩） | 2,648,213 B | **2,129,793 B** |
| 其中 JS | 56 个 / 1,288,966 B | 56 个 / 1,288,966 B |
| 其中 CSS | 8 个 / 797,098 B | 8 个 / 797,098 B |
| **其中字体** | **10 个 / 560,000 B** | **1 个 / 41,580 B** |

字体减少 **518,420 B（−19.6% 总传输）**，请求减少 9 个。生产环境 gzip 后总量约 1.05 MB，字体原本占其中约 53%。

## 根因

不是误拉。英文界面（`lang=en`）实测 **0 个**中文字体请求，`--font-sans` 的 per-glyph fallback 本身是正确工作的。

问题是两件事叠加：

1. **切片粒度**。`site/media/fonts/` 里有 101 个 `noto-sans-sc-*-var.woff2`，每片 40–76 KB。切片按频率**倒序**编号（`118` 装下 top-40 常用字里的 30 个，`119` 装 4 个），所以常用字确实集中在尾部两片。但登录页有约 100 个**不同**汉字（`登录`、`隐私`、`验证`、`账户`、`继续`…），这些字在码点空间上分散，实测横跨 9 片。
2. **字体栈顺序**。`--font-sans` 原本是 `"Geist Sans", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", …`——自托管 Noto 排在平台字体**之前**，于是 macOS / Windows / Android 明明自带质量很好的中文字体，浏览器仍然必须下载 560 KB 的切片。

## 修改

`--font-sans` 改为 `"Geist Sans", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", Arial, sans-serif`。

- 拉丁字符仍由 Geist Sans 提供，不变。
- 中文优先用平台字体：PingFang SC（macOS/iOS）、Microsoft YaHei（Windows）、系统 CJK（Android）——都是已安装的，0 字节。
- 自托管 Noto Sans SC 仍排在通用 `sans-serif` 之前，所以没有中文字体的 Linux 环境依然能正常渲染。
- 同步位置：`frontend/src/styles/themes.css`（基础 + philosophy 主题）、`packages/theme/src/ui.ts`（生成 `tokens.generated.css`）、`packages/theme/src/fonts.ts`（Universal App Web 端）。

`e2e/performance-loading.spec.mjs` 的字体用例原本断言 `Noto Sans SC` 必须排在 `PingFang SC` 之前——那正是本轮要推翻的契约，已改为断言「Geist 在最前、平台 CJK 字体在自托管 Noto 之前」，并新增一条**用户可见属性**的断言：16px 下 `，` 的宽度必须 > 14px。半角逗号是字体栈没走到 CJK 字体的症状，用 advance width 测比读字符串更接近真实故障。

## 评估过但没做的方案

| 方案 | 结论 |
| --- | --- |
| 重新切片（按频率重新分片，预期 −25%） | **实测失败，已回滚**。见下节。 |
| 按 surface 拆分 CSS（7 张 `media="print"` 表其实照样下载 117,798 B） | 收益 27 KB gzip，但会打破「一个阻塞 CSS 包」的契约。`check-css-debt.mjs` 正是校验 `index.html` 的层叠顺序，`legacy/` 与 `restore/` 的顺序是承重的，改动风险与收益不成比例。 |
| 未登录不挂载 RN shell（`chunk-Do2EuR3z.js` 224 KB / gzip 68 KB 在登录页加载） | `react/lib/boot/specs.tsx` 明确注释 shell 与 auth/config **并行**挂载是有意设计。串行化会让已登录用户（主要路径）多等一个 auth RTT，是负收益。 |
| markdown 移出启动闭包（`vendor-markdown` 69,812 + `chunk-CEAcFTU-` 39,606） | 只能做一半：`chat/messages.ts`、`session/historyRestore.ts` 同步调用 `formatMsg`，改成异步会改变历史恢复语义。只有纯文本 helper（`findLastUserMessage`、`stripMarkdown`）能改指向 `render/markdownText.ts`，但那不会把 marked/DOMPurify 移出闭包。 |
| AuthGate 拆成懒加载 chunk | 登录页是匿名用户**唯一**的内容，延后它等于拖慢 FCP 关键路径；而它只值约 10 KB gzip。不值得。 |

## 重新切片：实测否决

原假设：把 97 个 188–276 码点的切片重排成 150 码点的更细切片，能让登录页从 9 片 / 518,420 B 降到约 9 片 / 344,250 B（−34%）。模拟脚本给出的数字支持这个假设。

实际做了一遍完整迁移后，实测**更差**：

| | 旧方案 | 新方案（150 码点/片） |
| --- | --- | --- |
| 登录页触发的切片 | 9 | 12 |
| 覆盖码点 | 1,780 | 1,800 |
| 传输字节 | 518,420 B | **527,844 B（+1.8%）** |
| 请求数 | 9 | 12 |

**为什么模拟错了**：字节数由「页面所需最生僻字的频率排名跨度」决定，不由切片大小决定。页面的 95 个汉字在频率序上跨越约 1,800 个码点，把它切成更小的片只会让**片数变多**，覆盖的码点总数几乎不变。切片粒度只影响「末尾那片浪费多少」，而这次页面的字符恰好落在片边界附近，反而多跨了一片。

**结论**：在频率序不变的前提下，任何切片粒度都无法降低这个成本。唯一还能降的是换一个更贴合真实语料的频率序（把页面用到的 95 个字排得更紧凑），但那需要一份中文语料频率表，且即便理想也只能到约 382 KB（−26%），仍然只影响无中文字体的 Linux 兜底路径。

迁移过程中确认了两件有用的事实，记录下来以免后人重复：

- Google Fonts 的 `text=` 端点返回的是**带 `fvar`/`gvar` 的真可变子集**，上限约 800 字/请求，因此不需要完整源字体也能生成任意子集。
- 旧切片里 993 个码点（`U+FEFF`、`U+200B`、PUA `U+E6xx`）**本来就没有字形**，只是被 `unicode-range` 声明了。重切片时剔除它们不是覆盖回退。


## 验证

- `npm run build` 通过；`npm run lint` 通过（0 error，15 条既有 warning）；`npm run typecheck:app` 通过（`packages/theme` 改动）；`node scripts/check-bundle-size.mjs` 通过。
- `npm run test:shared` 80/80 通过（覆盖 `packages/core`、`packages/ui` 等；见上一轮文档里 `CATEGORY_TEMPLATES` 的修正记录）。
- `e2e/performance-loading.spec.mjs` 10/10 通过；`boot` 2/2；`landing-light-visual`、`chat-light-palette`、`theme-system`、`sidebar-light-theme`、`home-customization` 共 11/11 通过。
- 中文截图已人工复查：`中文字体优先下载` 在 Windows 上以 Microsoft YaHei 渲染，字形完整、无豆腐块；`commaWidth` 实测 16px，全角标点未退化。

## 已知遗留（均非本轮引入）

| 失败项 | 根因 |
| --- | --- |
| `e2e/composer-tools-visual-baseline.spec.mjs` 像素基线 | `components/menu.css` 的 `text-transform: uppercase` 由 2026-11-16 12:31 的 commit `b7bf85b1` 加入，基线 PNG 生成于 2026-11-09。失败截图显示差异是分组标题从 `Add context` 变成 `ADD CONTEXT`，与字体无关。 |
| `e2e/reference-ui-visual.spec.mjs:111` 移动端工具面板宽度 | 同一 commit 把该面板的 `left/right/width` 从 `!important` 改成普通声明，面板现在是满宽 390px，而规格期望它落在 16px 页面边距内（358px）。`menu.css` 本轮未改动，固定定位元素的宽度也不受字体栈影响。 |

两项都源自同一次在途 UI 重构。本轮没有代为修改：`linux` 基线无法在 Windows 上重建，只更新 `win32` 会造成平台不一致的基线集；移动端面板是满宽还是 16px 内缩属于设计决定，应由引入该改动的提交一并裁定。


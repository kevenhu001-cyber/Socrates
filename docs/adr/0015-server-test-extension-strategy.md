# ADR 0015 — 后端测试保留 `.js` 扩展名，由 `tsx` 解析 `.ts` 源

- 状态：Accepted（采纳"暂不改扩展名"，并给出一条可随时启动的收敛路径）
- 日期：2026-09-29
- 决策者：项目所有者 + AI 协作会话
- 关联：`docs/audits/2026-09-20-structural-review.md` F-016、`docs/adr/0003-structural-debt-categories.md`

## 背景

F-016 记录：`server/test/*.test.js` 里的 `import '.../crypto.js'` 指向的实际源是 `crypto.ts`（`server/src` 全量 `.ts`，无 `.js` 副本），裸 `node --test` 会抛 `ERR_MODULE_NOT_FOUND`，因此审计当时判定"`npm run test:unit` 绕过"。

2026-09-29 复核，事实与审计描述**有出入**，需要更正：

1. **测试并非"绕过"**。`package.json` 的 `test:unit` / `test` / `test:coverage` 三条脚本都显式带 `--import tsx`，`tsx` 是**已声明的正式依赖**（`server/package.json` devDependencies `"tsx": "^4.23.1"`），且 `dev` / `db:migrate` 也在用。实测 `npx tsx --test test/crypto.test.js` → 12 passed / 0 failed。这是一条被显式选择的工具链，不是临时补丁。
2. **`.js` 说明符在 NodeNext 下是 TS 的正确写法**。`tsconfig.json` 用 `moduleResolution: "NodeNext"`，该模式下 TS 规定源码里的相对导入**必须写运行时扩展名 `.js`**，由编译器映射回 `.ts`。所以测试文件里的写法本身没错。
3. **真正的缺口是"测试不被类型检查"**。`tsconfig.json` 的 `include` 只有 `["src/**/*.ts"]`，测试目录完全在类型检查范围之外。F-016 描述的"扩展名不一致"只是这个缺口的**表征**。

### 实测代价（2026-09-29）

把 65 个 `test/*.test.js` 改名为 `.ts` 并纳入 `include`、用**未经放宽的** `tsconfig.json` 选项跑 `tsc --noEmit`：

| 指标 | 数值 |
| --- | --- |
| 总错误数 | **1002**，全部落在 `test/`，`src/` 仍为 0 |
| 涉及文件 | **53 / 65** |
| 最重 | `chat-helpers`=139、`llm`=100、`fetchBatch`=95、`oauthFlow`=69、`error-middleware`=53 |

错误类别分布（决定它是机械清理还是结构问题）：

| 类别 | 数量 | 占比 |
| --- | --- | --- |
| 隐式 any / 未标注参数（TS7006/7034/7005/7016/7031） | 398 | 40% |
| 赋值不兼容（TS2345/2322/2739/2740/2571/2790） | 234 | 23% |
| mock 的 `req`/`res` 可空性（TS18047/2531/18048/2532/18046/18049/2538） | 165 | 16% |
| 未类型化 mock 上的属性/参数个数（TS2339/2554/2353/2769） | 153 | 16% |
| 模块解析（TS2794/5097） | 28 | 3% |
| 索引签名（TS7019/7053） | 18 | 2% |
| 其它 | 6 | 1% |

**73%（734/1002）属于"测试里大量手搓未类型化 mock"这一种形态**，与被测逻辑正确性无关。

> 测量方法附注：首次测量因在 Windows 上用 `execFileSync('npx', ...)` 未能启动（`npx` 是 `.cmd` shim，缺 `shell: true` 抛 ENOENT，被脚本读成"零错误"），得到过**假绿**。改为直连 `node_modules/typescript/bin/tsc`，并先植入一个故意的类型错误验证探针确实在检查测试文件，才取到上表数字。此坑记录在此，避免后续复现。

## 备选方案

### A. 测试改名 `.ts` 并纳入 `tsconfig`（一次性根治）
- 收益：测试进入类型检查，`npm run typecheck` 真实覆盖 65 个文件。
- 代价：一次性清 1002 个错误、跨 53 个文件。虽是 73% 机械错误，仍是**一个 PR 内的巨量改动**，且测试正是用来在重构中提供安全网的——在安全网自身被大改的同一个 PR 里改被测代码以外的任何东西，风险收益比很差。
- 风险：单 PR 回归定位困难；任一 mock 类型标注错误可能让测试编译失败而非运行失败，掩盖真实断言结果。

### B. 维持现状，不做任何事（否决）
- 代价：测试永不进入类型检查。F-016 会在每次结构审查里被重新发现，消耗复核成本；同时"测试文件写法是否正确"始终没有编译器背书。
- 已有真实成本：本次为确认 `.js` 说明符合法性，额外做了上面那套改名实测。

### C. 保持 `.js` 扩展名 + 新增一个 `tsconfig.test.json`，以**非阻断**方式逐步收敛（采用本 ADR）
- `tsconfig.test.json` 继承主配置，`include` 覆盖 `test/`，先允许 `noImplicitAny: false` 等**显式声明的宽松项**，让 `npm run typecheck:tests` 以"报告不阻断"方式上线。
- 按 ADR 0012 的分片模板，以"每次收掉一个测试文件"为一个小 PR，把该文件从宽松名单移入严格名单，直到全量严格。
- 采纳原因：与既有"每 PR 单一子目标"治理模板一致；每步可独立 revert；类型债有显式清单而不是隐藏在一个永不检查的目录里。

## 决策

采纳 **C**：**不批量改扩展名**，改为"扩展名保持 `.js`（NodeNext 正确写法），类型检查分阶段接入"。

1. **更正 F-016 的定性**：不是"扩展名不一致导致测试跑不起来"，而是"测试未纳入类型检查"。`tsx` 依赖是有意为之，不是绕过。
2. **新增 `server/tsconfig.test.json` + `npm run typecheck:tests`**，**先不接入 CI 阻断**（否则等于一次性要求清完 1002 个错误）。
3. **不把 1002 个错误当作待办债**。它们是"测试 mock 未类型化"的表征；真正的价值是让 `test/` 进入编译视野，后续新增测试默认受检。历史 65 个文件的严格化按 PR 增量推进，不设硬性 deadline。
4. **`test:unit` 保持现状**（`.js` + `--import tsx`）。它工作正常，不是缺陷。

## 影响

- **代码**：本 ADR 本身不改测试文件。后续每个"严格化一个测试文件"的 PR 只动一个文件。
- **构建**：无。`tsconfig.test.json` 仅供 typecheck 使用，不参与打包。
- **CI**：暂不新增阻断门。`typecheck:tests` 可先在本地/CI 作为**报告型**步骤运行；待严格名单清空后再考虑转阻断。
- **数据**：无 schema 变更。
- **依赖**：无新增。沿用既有 `tsx` 与 `typescript`。
- **文档**：F-016 在 `docs/audits/2026-09-20-structural-review.md` 中的结论需要按 §背景 更正。

## 可逆性

- 回滚成本：低。`tsconfig.test.json` 与一条 npm script 是新增文件，删除即回滚。
- 回滚步骤：删除 `server/tsconfig.test.json` 与 `package.json` 中的 `typecheck:tests` 行。
- 边界保护：每个"严格化"PR 独立 revert，且必须先保证 `npm run test:unit` 全绿——测试行为不得因类型标注而改变。

## 后续动作（本 ADR 范围内）

1. 新增 `server/tsconfig.test.json`（宽松起步）与 `npm run typecheck:tests`。
2. 更正 `docs/audits/2026-09-20-structural-review.md` F-016 的结论。

## 相关链接

- `docs/audits/2026-09-20-structural-review.md` F-016（原始记录，结论待更正）
- `server/package.json`（`test:unit` / `test` / `test:coverage` 均带 `--import tsx`；`tsx` 为正式依赖）
- `server/tsconfig.json`（`moduleResolution: NodeNext`、`include: ["src/**/*.ts"]`）
- ADR 0003（结构债分类）、ADR 0012（分片迁移模板）

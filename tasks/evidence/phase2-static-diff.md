# Phase 2: 静态 diff 报告 — 真实回归源

## 红线结论(按优先级)

### 1. `window.skipDiagQuestion` 丢失 — 高置信度回归
- `main.js:3301` inline `onclick="skipDiagQuestion()"` (诊断题 Skip 按钮)
- `main.js` 里函数定义存在(line 3315)
- 但 `window.skipDiagQuestion = skipDiagQuestion` 桥接在 Phase A/B 拆分时被删
- `windowExports.js` 也没接
- **结果**:学生点 Skip → `ReferenceError: skipDiagQuestion is not defined`

### 2. `window.clearActiveTemplate` 丢失 — 高置信度回归
- `main.js:4147` inline `onclick="clearActiveTemplate()"` (Template mode 关闭 × 按钮)
- 同上:函数还在 main.js,但 window 桥丢失
- **结果**:Template mode 关闭按钮抛 ReferenceError

### 3. `window.BEAGLE_BUILT_IN` 丢失 — 中置信度回归
- `auth/boot.js:87-91` 读 `window.BEAGLE_BUILT_IN`
- main.js 里 `window.BEAGLE_BUILT_IN = BEAGLE_BUILT_IN` 被删
- **结果**:`/api/config` 提供的 beagle model 无法写到主模块,Beagle 默认模型可能停留在源码 hardcode

### 4. `exitAgentMode`/`openAgentView`/`deleteAgentRun` — **死引用** (已修)
- main.js:13112-13114 + 13140 暴露这三个未定义的函数
- bundle 引用 → `ReferenceError: exitAgentMode is not defined` (Phase 1 实证)
- **修复**:已删除暴露,留注释占位

### 5. `refreshApiConfig` 早退路径不调 markProvidersFetched (已修)
- `refreshApiConfig` 第 10819 行 early-return (无 CURRENT_USER) 不调 `markProvidersFetched`
- 后续 `syncModelPills()` 永远显示 "Loading…",picker 永远是空状态
- **修复**:early-return 也调 markProvidersFetched + syncModelPills + renderProviderList

## 待修复
1. `window.skipDiagQuestion` — 在 windowExports.js 末尾桥接(但需 main.js export 才行)
2. `window.clearActiveTemplate` — 同上
3. `window.BEAGLE_BUILT_IN` — 同上

## 修法选择
- 方案 A:把 main.js 内的 skipDiagQuestion / clearActiveTemplate 改为 export,然后 windowExports.js 桥接
- 方案 B:把 inline `onclick="..."` 改为 addEventListener wiring,避免依赖 window
- 方案 C:在 main.js 内部自留一份小桥接,仅这几行

最简:方案 C — 在 main.js 已有 window 桥块附近加 3 行。

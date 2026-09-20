# ADR 0001 — Web 客户端路线：保留 Vite SPA，React/TS 化并对齐 LobeHub 分层

- 状态：Accepted
- 日期：2026-09-04
- 决策者：项目所有者 + AI 协作会话

## 背景

项目存在两条相互冲突的前端路线：

1. `docs/plans/unification-plan.md`（2025）：将 `frontend/`（Vite SPA）整体迁入
   `mobile/`（Expo React Native），以 Expo Web 取代 Web 端，最终删除
   `frontend/`。
2. `docs/plans/react-typescript-migration.md`（进行中）：保留 Vite SPA，把
   `main.js`（迁移前 ~9,900 行 vanilla JS；2026-09 已拆至 ~930 行）逐岛迁移为 React 19 + TypeScript，
   已完成大部分用户可见面（消息列表、composer、cmd-k、sidebar 等）。

同时，对照 LobeHub（LobeChat）的系统性架构，Socrates 需要在
状态层、渲染管道、工具协议、服务端分层四个方向对齐（见
`docs/adr/0002-lobehub-alignment-scope.md` 中记录的范围决策，若未创建
则以本 ADR 与会话记录为准）。

## 决策

1. **保留 Vite SPA 作为 Web 客户端**，继续并完成 React/TS 迁移路线。
   `frontend/` 不会被删除。
2. **搁置** `docs/plans/unification-plan.md` 的 Expo Web 替换方案（不删除该
   文档）。`mobile/` 继续作为原生 Android/iOS 客户端，通过
   `packages/`（`@socrates/core`、`@socrates/contracts`、theme tokens）
   与 Web 共享逻辑。
3. 前端状态层引入 **Zustand 5**，按域组织 store（chat/session/kb/
   exam/ui/search），对齐 LobeHub 的 `src/store/` slice 模式，逐步
   替换 `state/store.js` + `window.*` 桥接。
4. 渲染层迁移到 **react-markdown + remark/rehype 插件管道 + shiki +
   virtua 虚拟化列表**，替换 marked + 命令式 DOM 后处理。
5. 服务端**保留 Express + REST + openapi.yaml 契约**，做分层重构
   （pipeline 化拆分 `routes/chat/stream.ts`、`index.runtime.ts`
   启动序列），不引入 tRPC/Next.js。

## 后果

- 正面：风险最低（迁移已过半、65 个 Playwright spec 是现成的回归网）；
  Web 端性能与功能无回退；与现有 `deploy.sh` 部署路径兼容。
- 负面：短期内继续维护两套渲染栈（Web + RN 适配层）；unification
  路线中被期待的"单代码库"目标延后。
- 中止条件：若 `mobile/` 需要成为主 Web 端（性能/覆盖证据），需新
  ADR 撤销本决策。

## 关联

- 执行计划：LobeHub 对齐 + 技术债清理（M1–M4，见会话记录）。
- Superseded：`docs/plans/unification-plan.md`（头部已标注）。

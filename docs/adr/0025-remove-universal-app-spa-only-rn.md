# ADR 0025 — 移除 Expo Universal App，SPA 成为唯一生产客户端并原地 RN 化

- 状态：Accepted
- 日期：2026-11-16
- 决策者：项目所有者
- 关联：0001、0016、0021、`docs/plans/2026-11-05-spa-rn-convergence.md`、`docs/architecture/ui-structure.md`

## 背景

项目长期并行维护两条客户端路线：`frontend/`（生产 Vite SPA）与 `apps/socrates/`（Expo Universal App，Web/Android/iOS）。2026-11-05 的收敛方案已把方向定为「SPA 优先」——`packages/ui` 作为 RN UI 的唯一产地，SPA 通过 `react-native-web` 按窄子路径消费；Universal App 退化为旧 barrel 的冻结消费方，不再产生收益。

此时双轨只剩负债：barrel `packages/ui/src/index.tsx`（1416 行）与 `shell/`、`composer/` 等子模块并存两套 Sidebar/ChatMessageList/Composer；`api/auth/chat/settings/platform` 五个包只被 Universal App 消费；CI 有专门的 universal lane 和 workflow；守卫脚本把 apps 路径硬编码进范围。Universal App 没有 iOS 工程，也没有真机签收。

## 备选方案

### A. 保留双轨，等 Universal App 追平子模块后再决定
继续维护一个没有生产流量、且视觉落后 SPA 一个版本的客户端，成本持续发生。

### B. 删除 Universal App，SPA 原地 RN 化
去掉第二套 app shell 与死代码，把 RN 组件统一通过 react-native-web 挂进 SPA；保留独立 Kotlin 客户端作为唯一的原生端。

### C. 保留 Universal App 作为实验平台
与既定「SPA 优先」方向冲突，且无签收计划，等于无限期维持双轨。

## 决策

选择 **B**。删除 `apps/socrates/` 及其专属资产；`frontend/` 成为唯一生产 Web 客户端，继续把 UI 一块块换成 `packages/ui` 子模块中的共享 RN 组件。保留 `apps/socrates-android/`（ADR 0021 的独立 Kotlin 客户端，共享 `/api/v2` 与 `@socrates/core`）。

## 影响

- 代码：删除 `apps/socrates/`、五个专属包、`packages/ui/src/index.tsx` barrel 与根 exports；新增 `frontend/scripts/check-ui-entry.mjs` 防止根入口回流。共享测试 runner 迁至根 `scripts/`。
- 数据：无 schema/API 变更；`/api/v2` 契约保持不变。
- 部署：`deploy.sh` 与 API 镜像流程不变；SPA 仍是 nginx 静态托管。
- 文档：AGENTS.md、两份 README、SPA 收敛方案、UI 结构文档、ADR 0020/0021 同步更新；`universal-app-migration.md` 作废归档。
- CI：删除 universal-app job、gate lane、`universal-app-build.yml`、dependabot/security 中的 apps 项；共享测试改在 Frontend lane 运行。

## 可逆性

- 回滚成本：低。所有删除均可由 git 恢复；执行前工作树干净。
- 回滚步骤：`git revert` 对应提交；若要恢复双轨，先恢复 `apps/socrates/` 与五包，再复原 CI/guard 范围。

## 相关链接

- ADR 0001（Web 客户端路线）、0016（移除 capacitor 壳）、0021（原生 Android 客户端）
- `docs/plans/2026-11-05-spa-rn-convergence.md`
- `docs/architecture/ui-structure.md`

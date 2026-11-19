# Socrates 架构与工程体验后续优化路线图

> 本文档规划了 P0（测试调度器）与 P1（文件解析 Worker 隔离）落地后，Socrates 代码库后续的演进路线。

## 里程碑

- **已完成**：
  - [x] **P0: 智能受影响测试调度器 (`npm run test:fast`)**：将单次验证耗时从 ~120s 缩短至 0.7s ~ 5s，实现全项目四端（Frontend, Server, Shared Packages, Site）与 E2E 规格按需映射。
  - [x] **P1: 文档解析 Worker 线程隔离 (`fileParsers/worker.ts` & `pool.ts`)**：PDF/Office/ODF 复杂文档解析移出 Node.js 主事件循环，支持 512MB 内存配额限制与 30s 超时自愈。
  - [x] **Phase 1（近期 · 效率与治理）**。将服务端根目录下的 49 个路由模块归入 11 个领域，更新 OpenAPI 扫描、受影响测试映射和 CI 路径。CSP 门禁支持定位差异和重新生成产物，双语词条门禁支持定位缺少翻译的词条。

- **Phase 2（跨端与渲染收敛）**
  - [x] 盘点启动注册表中的 34 个挂载点。将其中 10 个可直接渲染的宿主收敛为 2 个 Portal 容器，保留 hydration、编辑器和页面加载等独立生命周期。
  - [x] 在共享契约中定义 Native Island 的预览和编辑器输入。SPA 通过 iframe 适配器按预览类型授予权限，TipTap 和专用可视化渲染器管理各自的浏览器资源。
  - [x] 将共享基础 Token 纳入现有 CSS 生成器，由 SPA 构建检查生成结果。
- **Phase 3（测试与高可用）**
  - [x] 通过 PGlite、pgvector 和真实迁移运行数据库单测。每个套件使用独立的内存数据库，跨进程并发契约由真实 PostgreSQL 测试覆盖。
  - [x] 将 189 个 SPA Playwright spec 分入 smoke、regression、visual 三个项目，保留现有全量入口。
  - [x] 将大消息的 RAG 文本切片移入带队列上限和超时的 Worker。短消息仍直接使用同一个切片函数。

当前路由结构见 [架构说明](../architecture/mental-model.md#4-server-boundaries)。门禁参数见 [脚本说明](../../scripts/README.md#门禁诊断与修复)。

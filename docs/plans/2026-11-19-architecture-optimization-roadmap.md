# Socrates 架构与工程体验后续优化路线图

> 本文档规划了 P0（测试调度器）与 P1（文件解析 Worker 隔离）落地后，Socrates 代码库后续的演进路线。

## 一、 里程碑总览

- **已完成**：
  - [x] **P0: 智能受影响测试调度器 (`npm run test:fast`)**：将单次验证耗时从 ~120s 缩短至 0.7s ~ 5s，实现全项目四端（Frontend, Server, Shared Packages, Site）与 E2E 规格按需映射。
  - [x] **P1: 文档解析 Worker 线程隔离 (`fileParsers/worker.ts` & `pool.ts`)**：PDF/Office/ODF 复杂文档解析移出 Node.js 主事件循环，支持 512MB 内存配额限制与 30s 超时自愈。

- **后续规划**：
  - **Phase 1（近期 · 效率与治理）**：门禁脚本自愈纠偏辅助 (`--suggest` / `--fix`) + 服务端 50+ 路由文件按领域归并重整。
  - **Phase 2（中期 · 跨端与渲染收敛）**：35 个挂载点容器化收敛 + 确立 Native Island 协议与适配器 + Token 单一事实源编译流。
  - **Phase 3（长期 · 深度测试与高可用）**：引入 PGlite 实现 100% 内存版零配置数据库单测 + Playwright 三级分流矩阵 + RAG 文本切片 Worker 隔离。

详细分解与方案说明请查阅系统生成的优化文档。

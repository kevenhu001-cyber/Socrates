# ADR 0019 — 服务依赖方向自动约束

日期：2026-10-16。状态：已实现，仓库验证通过；远端 CI 待实际执行。

## 问题与决策

前几轮已移除 scheduler 对聊天路由工具函数的直接依赖，但文字约定不能阻止回归。本轮检查还发现执行器通过 HTTP 审计中间件获取 `recordAudit`，以及 OAuth 元数据通过 scope 中间件获取权限常量。两处都属于共用逻辑被 HTTP 层拥有的问题。

`recordAudit` 原样下沉到 `services/core/audit.ts`，HTTP 审计中间件保留兼容导出。权限词表、描述、集合和纯解析函数下沉到 `lib/authScopes.ts`，scope 中间件保留原公共导出，HTTP 权限检查继续留在中间件。认证模块、OAuth 元数据和种子脚本直接使用中立词表。权限值、令牌语法、审计错误处理及数据库 schema 没有变更。

新增 `server/scripts/check-service-boundaries.mjs`，保护 `server/src/services/`、`lib/`、`db/`：

- 不可直接或通过转发/中立模块到达 routes、middleware、boot、app/runtime 入口、frontend/apps 或 packages/ui。
- 使用本地 TypeScript 7 原生 AST，而非正则提取源码；覆盖 import、export-from、类型导入、动态字面量 import、require/resolve、import-equals 和 createRequire 的直接别名。tsconfig 路径别名通过编译器解析。
- 跟踪本地依赖图；兼容 shim 不能成为跨层跳板，内部循环使用 visited 集合终止。运行时 Express/React 家族依赖禁止，外部框架纯类型导入可保留。
- 计算出来的 import/require 路径无法静态证明，因此在受保护依赖链中报错，要求使用字面量。注释、正则、展示用字符串和模板正文不会形成边。
- 违规打印文件、行号和必要的中转链，退出码 1。源文件读取、配置和解析失败也失败；不允许空扫描成功。源码符号链接要求改为显式导入。
- `service-boundaries.baseline.json` 固定为空。项目约定的 `--update` 可刷新空基线，但不能新增豁免，也不能把当前违规写入基线。

## 接入与验证

服务端 `npm run lint` 组合 typecheck 和 `lint:boundaries`；主 CI Server job 改为调用该 lint，快速 Server CI 已使用它。根 lint 追加 `lint:server-boundaries`，root verify 继承门禁。不依赖前端安装，也不新增 npm 包。新测试由现有 Node 测试发现规则执行。

18 项临时项目测试主动注入静态、类型、动态、CommonJS、别名及跨中转层违规，同时验证正常方向、循环终止和内容文本不误报。权限兼容导出与 OAuth discovery 验证同一词表，临时 PostgreSQL 验证审计落库；现有 OAuth PKCE/refresh/revoke、Agent Key、scope 中间件、审计和执行器入口回归一并执行。

## 范围与维护

这是服务依赖方向门禁，没有冻结所有服务子域之间的依赖，也没有禁止全部服务内部循环。没有静态分析 eval、任意反射、通用函数调用返回的模块加载器或其他运行时代码生成。需要扩展加载方式时应先扩展检查器和违规夹具；不依赖编码约定绕过检查。

检查器使用已锁定 TypeScript 7 的 `unstable/sync` 与 `unstable/ast` 接口。升级编译器时必须同时运行门禁及夹具；接口不兼容会失败，不会跳过检查。无生产迁移或部署要求；撤销这次门禁会失去后续结构回归保护，公共导出的兼容性不依赖门禁运行。

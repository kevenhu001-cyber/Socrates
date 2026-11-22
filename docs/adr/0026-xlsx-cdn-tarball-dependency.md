# ADR 0026 — `xlsx` 允许从 SheetJS CDN 安装（非 npm registry tarball）

- 状态：Accepted
- 日期：2026-11-22
- 决策者：项目所有者 + AI 协作会话
- 关联：`docs/audits/2026-10-30-technical-debt-followup.md`、`.github/workflows/security.yml`

## 背景

`server/package.json` 的 `xlsx` 依赖写的是
`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`，不是版本号。

这条依赖唯一的使用点是 `server/src/services/fileParsers/legacyXls.ts`（BIFF `.xls`
文本抽取）。该文件依赖 0.20.x 的 ESM 构建与 `XLSX.read(buffer, { type: 'buffer' })`
语义：0.20 起 SheetJS 不再提供文件系统 helper，抽取器因此显式读 buffer（见该文件
第 24-32 行注释）。

npm registry 上 `xlsx` 的最后一次发布是 **0.18.5**（实测 `npm view xlsx version`）。
SheetJS 在 0.19 之后把发布迁到自家 CDN，registry 版本不再更新。也就是说：

- 用 registry 版本 = 停留在 0.18.5，与本文件已按 0.20 写的实现不一致；
- 用 CDN tarball = 版本正确，但**脱离 npm advisory / `npm audit` 的覆盖范围**。

`server/package-lock.json` 对该依赖记录了 `integrity`
（`sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==`）
与精确版本 `0.20.3`，因此安装字节仍是可校验的。

## 决策

保留 CDN tarball，并把它当作一条**有记录的供应链例外**，而不是无声的临时做法：

1. 版本必须精确锁定（当前 `0.20.3`），不使用 `^` / `latest` / 分支 URL。
2. 升级时必须在同一个 PR 里核对 `package-lock.json` 的 `integrity` 变化，并读一遍
   上游 release notes；CI 的 advisory 扫描看不到这个包，人工复核是唯一闸门。
3. 使用面保持在 `legacyXls.ts` 一处。若将来出现第二个 import，先评估替代库
   （例如只覆盖 BIFF 的轻量解析器），而不是扩大例外。
4. 若 registry 重新出现可用的 0.20+ 版本，回到 registry 依赖，并把本 ADR 标记为
   Superseded。

## 备选方案

- **A. 降到 registry 的 `xlsx@0.18.5`** —— 与现有 0.20 语义注释冲突，需要重写
  `legacyXls.ts` 的读取路径，且 0.18 有已知的 prototype-pollution / ReDoS 历史
  公告，净收益为负。
- **B. 换成 exceljs 或其它库** —— exceljs 只读 OOXML `.xlsx`，不读 BIFF `.xls`，
  等于放弃一类用户上传格式。
- **C. 自建代理镜像 tarball 并发布到内部 registry** —— 增加一条运维链路，当前
  CI 与部署形态没有内部 registry，收益不足。

## 影响

- `security.yml` 的 `npm audit` / advisory 基线（`scripts/audit.baseline.json`）
  永远看不到 `xlsx`。这是**已知盲区**，不是"零告警"的证据。
- SBOM 仍会记录该包及其 `resolved` URL，供应链清单不缺条目。
- 关闭/复审条件写在第 4 条：registry 恢复即回迁。

## 可逆性

回滚成本低：把 `server/package.json` 的 `xlsx` 改回 registry 版本（或替代库），
重装并跑 `npm --prefix server run typecheck` 与
`npm --prefix server run test:one -- test/fileParsersFormats.test.js`（或该目录对应的
解析器测试）。不涉及 schema、部署脚本或客户端契约。

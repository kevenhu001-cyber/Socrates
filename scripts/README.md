# `scripts/` — operator & utility scripts index

本目录是 Socrates 的**操作脚本与一次性工具**入口。  
新增脚本前先读本 README 末尾的"约定"段。

## 目录速览

```
scripts/
├── README.md                    ← 你正在读
├── archive/                     ← 一次性、已完结的 audit 历史（参见下文"归档"）
├── backup/                      ← 生产数据备份（参见下文"backup"）
├── utils/                       ← 复用率低、有命名子域的工具集（参见下文"utils"）
├── backup-secrets.sh            ← 把 secrets/ 加密备份到 ~/.socrates-backups
├── check-drizzle-drift.mjs      ← **CI 门禁**：drizzle migration 元数据漂移（server job）
├── check-openapi-drift.mjs      ← **CI 门禁**：路由 ↔ openapi.yaml 双向漂移棘轮（sanity job）
├── audit-ratchet.mjs            ← **CI 门禁**：npm audit 棘轮（security.yml）
├── coverage-ratchet.mjs         ← **CI 门禁**：覆盖率棘轮（ci.yml）
├── gen-csp-hashes.mjs           ← 生成 SPA CSP hash 片段（deploy.sh 用）
├── *.baseline.json              ← 各棘轮的基线数据（audit / coverage / openapi）
├── clean-local-artifacts.sh     ← 移除本仓库未跟踪的临时产物（shots、debug.log 等）
├── restart-server.sh            ← 停 + 起 socrates-api systemd 服务
├── rotate-secrets.sh            ← 重新生成 secrets/SESSION_SECRET 等敏感值
├── search.sh                    ← 全仓 ripgrep 助手（用法见脚本注释）
└── test-deploy-flow.sh          ← **CI 强路径**：.github/workflows/build-apk.yml 调它
```

## 关于「根目录里的脚本」

下列 5 个 `.sh` / `.mjs` **必须保留在 `scripts/` 根**，因为外部有不可移动的引用：

| 脚本 | 外部引用 |
| --- | --- |
| `backup-secrets.sh` | 自包含；引用 `scripts/rotate-secrets.sh`、`scripts/restart-server.sh` |
| `restart-server.sh` | 自包含 |
| `rotate-secrets.sh` | `scripts/backup-secrets.sh` 内部调用 |
| `clean-local-artifacts.sh` | `scripts/README.md`（本文）引用方式说明 |
| `test-deploy-flow.sh` | `.github/workflows/build-apk.yml:189`（**CI 强约束**） |

**严禁把上表脚本移入子目录**。如需调整，先改所有调用点 + 更新 CI 流水线。

## `scripts/archive/` — 已完结的一次性 audit

```
archive/
├── .gitkeep
├── audit-legacy-bag.mjs           ← M3/legacy-bag 清查（v4, 已闭）
└── audit-window-bridges.mjs       ← M5/window-bridge 清查（已闭）
```

不删的原因：
1. 两份 audit 的输出会作为后续 audit（如果发生）的对照基线。
2. 它们是历史决策的**可复现证据**——参照 `docs/audits/` 才是当代工作面。

## `scripts/backup/` — 生产数据备份

```
backup/
└── backup-db.sh                 ← pg_dump -Fc → GPG 加密 → /var/backups/socrates/ 轮转
```

- 与 `backup-secrets.sh` 是同一信任边界（root-only、读同一个 env 文件、同一
  `BACKUP_PASSPHRASE` 约定），但它备份的是**数据库本体**——secrets 脚本只覆盖
  env/SESSION_SECRET。2026-09-26 审查发现 DB 无任何备份路径后补建。
- 加密前会先 `pg_restore --list` 验证 TOC，写盘即失败而不是备份失败。
- 调度与异地副本的注意事项写在脚本头注释（cron 样例 + rclone/rsync 说明）。

## `scripts/utils/` — 复用率低的工具集

```
utils/
├── .gitkeep
├── add_animate_text.py            ← 动画文本便利脚本（来源不清晰，无 README）
├── capture_site.js                ← 市场站截图/抓取用
├── dump-palette.py                ← 设计令牌导出脚本
├── resolve-site-merge.ps1         ← PowerShell 站点合并工具
├── verify-tokens.py               ← 设计令牌校验脚本
```

未知/孤立脚本处置：**不在本 PR 改动其内容**；若长期无引用将走 `archive/`。
PR 中如果引用了这些脚本，请把它们的归属与约束写到子目录 README。

## 命名与路径约定（写到 scripts/ 根的硬约束）

1. **不要再往 `scripts/` 根新增脚本。** 新增请走 `scripts/utils/<group>/`，
   或者开一个新分组 `scripts/<aspect>/` 并在 `scripts/README.md` 加索引行。
2. **CI 流水线只能引用** 根目录的 `scripts/<name>.sh|.mjs`；如某个脚本从根目录
   移到子目录，对应 workflow 与所有调用方必须同步修复（落到 `archive/` 例外）。
3. **一次性的 audit / probe 脚本** 直接落 `scripts/archive/<tag>-<date>-<topic>.mjs`；
   标记完结后不需要再被引用。

## 相关 ADR

- `docs/adr/0003-structural-debt-categories.md` — 本次结构调整背后的 P0/P1/P2 规则
- `docs/audits/2026-09-20-structural-review.md` F-012 — 这次清理的源材料

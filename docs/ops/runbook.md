# Socrates 运维手册（维护者）

> **状态说明：** 本文只基于仓库脚本与配置写流程，不代表已验证生产之外的环境。仓库没有证据证明 staging、告警链路、备份异地副本或恢复演练已配置/成功。本文建议的 SLO、RPO、RTO 均为**待验证目标**，不是现状承诺。所有生产操作须由获授权维护者在变更窗口执行；本文编写未连接或修改生产/远端。

## 1. 发布前门禁

1. **确认变更与回退条件。** 检查 `git status`、提交差异、迁移和环境变量影响；记录 commit SHA、操作者、窗口、验证人。确认有可用 DB/密钥备份且恢复凭据可用；不把密钥放入终端历史、工单或仓库。
2. **分支保护（待人工核验/配置）：** 在 GitHub 仓库设置 `main` 分支保护/规则集：禁止直接推送，要求 PR、至少一名审查者、要求相关 CI 检查通过、限制管理员绕过；检查实际规则与必需检查名并记录。仓库文件本身不能证明远端规则已启用。
3. **CI 与静态门禁：** PR/待发提交应通过仓库工作流（`.github/workflows/ci.yml`、`server-ci.yml`、`security.yml` 等）；本地可运行 按各包锁文件安装依赖并生成 WASM 后运行 `npm run verify`（typecheck、lint、共享测试），再运行 `npm run test:unit`、`npm run openapi:check`、`npm run test:openapi`、`node --test scripts/test-verify-sbom.mjs`、`bash scripts/test-deploy-flow.sh`；前端 build 后运行完整 `parity:check` 和相关 Playwright 套件。服务端迁移改动另核对 `server` 包脚本与 Drizzle schema；不要将本地通过等同于远端必需检查已通过。
4. **CodeQL（待人工 triage）：** 检查 GitHub Security/Code scanning 中默认分支与待发提交的 CodeQL 结果；每项告警由维护者判定、修复或按流程记录误报/接受风险，未 triage 不视为“通过”。仓库有 `security.yml` 不代表扫描已运行、无告警或已处理。
5. **部署脚本预检：** 在目标部署主机、正确 checkout 与授权账户下审阅 `./deploy.sh --help` 与 `./deploy.sh --site-only --dry-run`（校验营销站目录、不写任何文件）。`--dry-run` 只在 `--site-only` 下可用；单独使用会被直接拒绝，因为它过去实际含义是"跳过合并门禁然后照样全量发布"。核实 `git`/`gh` 登录可用，确保 `deploy.sh` 的提交 CI gate 对**当前 commit**为绿。脚本缺少 `git`/`gh`、无法解析 HEAD、查询失败、无已完成成功结果时均默认拒绝发布；`DEPLOY_SKIP_CI_CHECK=1` 是有审计记录的绕过，不是常规做法。生产脚本要求 `sudo -n` 可用、`flock` 可用。
6. **staging（待建立/验证）：** 人工确认有隔离的 staging 主机、数据库、域名、独立密钥和证书，部署同一 SHA，执行 API/登录/核心聊天与迁移兼容性冒烟，再记录结果。仓库未证明 staging 已存在；未验证前标为阻塞/风险接受，不能声称已通过 staging。
7. 冻结发布 SHA；确认变更影响、兼容迁移、回滚责任人和观测窗口。若 schema 为破坏性变更，采用先兼容扩展、后清理的分阶段迁移；`deploy.sh` 的应用回退**不会**回滚数据库迁移。

## 2. 正常发布与回滚边界

生产部署脚本 `deploy.sh` 默认路径指向 `/home/ubuntu/User/Socrates/{frontend,server}`，站点根 `/var/www/...`，nginx 配置 `/etc/nginx/sites-available/app.topodrive.top`。仅在核对主机、路径、SHA 和门禁后，由授权维护者运行：

```bash
cd /home/ubuntu/User/Socrates
git rev-parse HEAD
./deploy.sh
```

不要传单个 HTML 路径作为完整发布；那是 legacy SPA 单文件模式。部署有 `flock` 并发锁、CI gate、构建/部署门禁与发布后公网探测；成功后 `.deploy-state.json` 记录状态。脚本会保留前端旧版本至 `$APP_WEB_ROOT/.previous/`，发布门禁失败时如有上一版会自动恢复后端 build；门禁失败时不更新 state。**这不是完整原子回滚，也不保证迁移可逆**。不要用 `--dry-run` 当实际发布验证，也不要随意设置 `DEPLOY_SKIP_CI_CHECK=1`。

状态页门禁分两层：**产物正确性**（源站 vhost 返回 2xx、本次安装的 `status.<TS>.html` 与源站返回字节一致、`/api/status` feed 可达）任一不达标即阻断发布；**公开 DNS 可达性**单独判定——主机名能解析时按公网 2xx 严格校验，不能解析时只告警并打印 DNSPod 补 A 记录的修复指引（该区在 DNSPod 控制台，仓库与脚本都无法代劳）。需要恢复"公网不可达即阻断"的旧语义时设 `STATUS_GATE_REQUIRE_PUBLIC=1`。`.deploy-state.json` 记录 `statusPublicDns` 与 `statusPublicReachable`。

营销站可以单独发布：`./deploy.sh --site-only` 只把 `site/` 静态树发布到 `$SITE_WEB_ROOT`，不构建 SPA、不迁移数据库、不重启后端、不 reload nginx，但同样占用 deploy 锁，因此不会与完整发布交叉执行。它在发布前先把已发布的页面与样式表快照到 `$SITE_WEB_ROOT/.previous/site-<时间戳>/`，公网内容门禁失败时从该快照恢复。该作用域默认**不**执行仓库合并门禁（没有工作流覆盖 `site/`，对 SPA 与服务端的门禁并不能说明这批字节是否可用），需要时显式加 `--require-merge-gate`。它的状态写入 `.deploy-state.site.json`，与完整发布的 `.deploy-state.json` 分开记录，避免把"前端可达""后端可达"等完整发布的检查项记在一次站点发布上。

故障时先停止继续发布，保存 deploy 输出、commit SHA 和日志，核对门禁结果。若需要人工回退前端，脚本输出了精确旧文件名及 nginx 指针命令；操作前确认版本、路径并备份当前配置：

```bash
ls -1 /var/www/app.topodrive.top/.previous/index.*.html
sudo cp -a /var/www/app.topodrive.top/.previous/index.<old-ts>.html /var/www/app.topodrive.top/
sudo sed -i 's|/index\.[0-9]\+\.html|/index.<old-ts>.html|' /etc/nginx/sites-available/app.topodrive.top
sudo nginx -t && sudo nginx -s reload
```

尖括号须替换成实际旧版本文件名；确认生效后再恢复配置备份（若失败）。后端构建由门禁失败流程在可用时自动恢复；不要手工猜构建路径，先查 `deploy.sh` 输出和 `.deploy-state.json`。若仅 `.env` 变更需重启，可用 `scripts/restart-server.sh`，它重启 `socrates-api.service` 并最多等 30 秒探测本机 health；在生产执行会中断进行中的 SSE 对话。DB schema/数据恢复不属于应用回滚，必须执行隔离恢复程序并由 DB 负责人审批。

## 3. DB 备份与隔离恢复演练

`sudo BACKUP_PASSPHRASE=... ./scripts/backup/backup-db.sh` 读取 `/home/ubuntu/socrates-api.env` 的 `DATABASE_URL`，`pg_dump -Fc` 后用 `pg_restore --list` 验证并 GPG 加密到 `/var/backups/socrates/`；默认保留 14 份。至少 16 字符的 passphrase 应从安全注入，勿写进 shell 历史；建议 root-only `/root/.socrates-backup.env`（mode 0600）。脚本中的每日 03:17 root cron 是**示例**，不可据此声称已配置。备份同盘不能应对主机丢失；异地复制方案与实际副本状态需人工确认。

**恢复演练必须隔离，严禁把 `--clean` 指向生产：**

1. 由 DB 管理员建立独立、不可路由到生产写流量的临时 DB/主机与临时凭据；核实 host/DB 名，隔离网络/权限，禁用邮件、外部 API、作业调度等副作用。恢复前双人复核目标连接串；不要在命令行记录真实凭据。
2. 选择一份备份并验证文件/清单，权限限制在 root：
   ```bash
   sudo install -d -m 700 /tmp/socrates-restore
   # BACKUP_FILE 设置为已复核的实际加密备份路径；交互输入 GPG passphrase
   sudo sh -c 'umask 077; gpg --output /tmp/socrates-restore/restore.dump --decrypt "$1"' sh "$BACKUP_FILE"
   sudo pg_restore --list /tmp/socrates-restore/restore.dump
   ```
   不要将 passphrase 放进命令参数或日志；上例由 GPG 交互读取，或采用已批准的受控秘密注入。校验 manifest/哈希（备份脚本生成的同批文件），记录备份时间与目标。
3. 只对已确认的**临时空数据库**运行恢复：
   ```bash
   sudo pg_restore --exit-on-error --clean --if-exists --dbname="$ISOLATED_DATABASE_URL" /tmp/socrates-restore/restore.dump
   ```
   运行前再次审查 `$ISOLATED_DATABASE_URL`；绝不复用生产 `DATABASE_URL`。按环境批准方式在隔离应用上验证迁移状态、表/行数、关键数据抽样及应用只读/功能 smoke test。
4. 记录恢复起止时间、数据点时间、错误、验证人及结果（含失败）；销毁临时数据库/密钥，安全清除解密 dump。演练未实际完成前不得填“成功”。DB 损坏/生产恢复需独立事故审批与专门执行计划，不照搬演练命令。

密钥/环境文件归档另用 `sudo BACKUP_PASSPHRASE=... ./scripts/backup-secrets.sh`，加密保存 env 与单独 `SESSION_SECRET` 到同一备份目录；后者可解密用户保存的 LLM API key，按最高敏感级别离线保管。实际归档同样需验证解密可读且不可在生产文件上测试。

## 4. 证书与密钥轮换

- **TLS 证书：** 仓库 deploy/nginx 样例没有可证明的证书签发/续期机制或证书文件路径。维护者先在目标机审查当前生效配置（`sudo nginx -T`，注意输出可能含敏感信息，勿外传），识别实际 `ssl_certificate`/私钥路径及签发方；按该签发方既定流程续期/部署，限制私钥权限，先 `sudo nginx -t`，再 `sudo nginx -s reload`，随后验证 `https://app.topodrive.top/api/health` 与证书有效期/域名链。确认续期自动任务及到期告警属于待人工核验，不假设 certbot。
- **应用密钥：** `scripts/rotate-secrets.sh` 只打印新值、不改 `.env`；生成值必须经安全通道录入 `/home/ubuntu/socrates-api.env`，mode 0600 且属服务账户。逐个在各自供应商先签发/启用新凭据、更新环境、重启/验证，再撤销旧凭据（若供应商支持重叠）；按该脚本列出的 OAuth、SMTP、Beagle provider 等手动轮换，不能只跑脚本。
- **严重注意：** 不要盲目替换 `SESSION_SECRET`：脚本明确表示它派生存储 API key 的加密密钥；轮换会使已有会话失效，并使已存密钥不可解密（除非另行实施并验证重加密迁移）。轮换前需业务批准、受控密钥备份/恢复方案、用户影响沟通与演练。改 `.env` 后 `./scripts/restart-server.sh`，检查 health、日志与认证/解密功能，再撤销旧值。泄露时立即按事件处理，不等常规窗口。

## 5. 故障分级与处置

仓库没有已验证的值班/告警渠道；以下为建议分级，联系人、响应时限及升级链路待维护者填实。

| 等级 | 建议判据 | 首要动作 |
|---|---|---|
| SEV-1 | 全站不可用/数据丢失或泄露、生产 DB 不可用、凭据外泄 | 立即升级负责人；保护证据、限制攻击/写入影响；暂停发布；由 DB/安全负责人批准恢复或撤销凭据；持续记录时间线。 |
| SEV-2 | 核心登录/聊天大面积失败、明显持续 5xx/延迟、发布后严重回归 | 暂停发布，核查 `/api/health`、systemd/journal、nginx 与最近 SHA；按回滚边界回退应用，通知负责人。 |
| SEV-3 | 局部功能受损、单一集成异常、无数据风险 | 建工单并定位；看日志与供应商状态，安排修复/密钥轮换；必要时升级。 |

## 6. 可观测性、建议目标（未验证）

已有可确认接口为 `GET /api/health`：`server/src/app.ts` 执行 DB `SELECT 1`，返回 `ok`、DB 状态、进程 uptime 与 pubsub 状态，失败为 HTTP 503；本机 `scripts/restart-server.sh` 使用 `http://127.0.0.1:3037/api/health`。发布脚本另做公网探测。日志可从 `sudo journalctl -u socrates-api.service --since '30 min ago' --no-pager` 与 `sudo systemctl status socrates-api.service --no-pager` 查看。`server/src/services/util/statusMonitor.ts` 每 30 秒探测组件、将状态变化存入 Postgres，并尝试向已确认的 status 邮件订阅者发送故障/恢复通知；这是代码能力，不证明 SMTP、订阅者、投递成功或有人接收已核验。应用另有 opt-in OpenTelemetry，只有设置 `OTEL_EXPORTER_OTLP_ENDPOINT` 才启用，仓库不能证明 collector/backend 已配置。内部指标 `GET /api/_internal/metrics`（同样支持 `/api/v2/_internal/metrics`）已实现，默认返回 404；只有显式配置至少 32 字节的高熵 `INTERNAL_METRICS_TOKEN` 后启用，抓取须发送专用 `Authorization: Bearer ...`。返回进程 uptime/内存、滚动请求指标和活跃 SSE 数，不是 Prometheus exposition 格式；抓取自身不计入业务请求采样。该能力仅在本地测试，生产部署、token/collector 与告警配置仍未核验；不要把凭据放到客户端或公共站点。`/api/health` 不是完整用户体验监控。

建议先实现并演练下列监控，再对外承诺目标：

| 指标/目标（建议、未验证） | 建议初始目标/检查 |
|---|---|
| 可用性 | 月度 API 成功率 ≥99.5%，按外部探针测 `GET /api/health` 与经授权的核心功能；区分健康探针和用户请求。 |
| 延迟/错误 | 记录请求量、5xx/超时率及 p50/p95/p99 延迟；按路由/依赖分组；告警阈值在基线与误报演练后设定。状态监控器已有滚动窗口平均响应时间/成功率数据能力；内部 metrics 接口仍待验证部署。 |
| 数据库/队列 | health DB 状态、连接池耗尽/查询延迟、Postgres 磁盘/连接数、pubsub 状态、迁移失败。 |
| 应用/主机 | `socrates-api.service` 重启/崩溃、CPU/内存/磁盘、SSE 活跃连接与中断、认证/邮件/LLM 依赖错误；避免日志记录密钥或个人数据。 |
| 证书/备份 | 证书到期检查（建议至少提前 30/14/7 天告警）；备份新鲜度、加密文件/TOC 校验、异地副本、恢复演练结果。 |
| SLO / RPO / RTO | **建议讨论目标**：API 月可用性 ≥99.5%；RPO ≤24 小时（前提是每日备份和可验证异地副本）；RTO ≤4 小时（前提是人员、主机、凭据与恢复路径实际演练）。当前备份 cron、异地复制、状态邮件订阅/投递、metrics 暴露及告警接收链路和演练结果均未核验，故这些数值不是现有能力或承诺。 |

建议 SLO 的错误预算为每月有效请求的 0.5%，具体请求口径、排除项和暂停发布阈值须先约定；耗尽后优先恢复可靠性。现有滚动 successRate 把 4xx 也视为失败，且仅有平均延迟，不可直接冒充月度 SLO 或 p95/p99。

**发布后人工核对：** `curl -fsS https://app.topodrive.top/api/health`（健康应 HTTP 200 且 `ok:true`, `db:"connected"`）；再检查 `sudo systemctl status socrates-api.service --no-pager`、`sudo journalctl -u socrates-api.service --since '15 min ago' --no-pager`，并用授权测试账号验证登录/核心路径。发布脚本的公网探针通过只表示有限 smoke gate，不代表 SLO、告警或用户路径已验证。

## 待人工完成清单

- [ ] 记录并核验 GitHub `main` 分支保护与必需检查；确认 bypass 权限。
- [ ] 人工 triage CodeQL 告警并记录处置/例外依据。
- [ ] 建立或确认 staging 隔离环境，演练同 SHA 发布和冒烟测试。
- [ ] 确认 DB 备份调度、异地副本及 passphrase 保管；在隔离环境完成恢复演练并记录证据。
- [ ] 核验证书路径、签发/续期/到期告警责任人和流程。
- [ ] 核验 status 邮件配置、已确认订阅者和真实投递/接收；确认 OTLP collector、`/api/_internal/metrics` 的部署与 `INTERNAL_METRICS_TOKEN` 安全配置、指标/日志保留、外部探针、告警接收人和值班升级链路；基于实测制定正式 SLO/RPO/RTO。

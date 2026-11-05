# 2026-11-05：聊天传输、配色与 CI 修复

## 已定位原因

1. **聊天 `fetch failed`**：生产 Node 24.19.0 内置 Undici 7.29.0，但直接依赖被升级至 Undici 8.12.3。`getLlmDispatcher()` 创建的 v8 dispatcher 交给 Node 原生 `fetch` 时，报 `UND_ERR_INVALID_ARG: invalid onRequestStart method`。无鉴权 HEAD 探针证实原生直连成功、带 dispatcher 失败。它影响聊天、embedding、预热和使用 pinned dispatcher 的网页抓取，不是浏览器网络断开。
2. **启动限流告警**：express-rate-limit 升至 v8 后，自定义 keyGenerator 直接使用 `req.ip`，触发 IPv6 绕过验证告警。不能禁用验证；应按默认 /56 分组。
3. **CI**：run 41830869076 的 Frontend Unit tests 失败 35 项，其余适用的 Repo sanity 通过；Merge gate 是前端失败的下游结果。主要是测试仍依赖已移除的 window 状态或已删除模块，以及 RN 迁移后的主题 first-paint/测试约定未同步。
4. **去色来源**：`f1f8bde0` 去掉蓝色动作、蓝色链接/焦点和青绿身份；`880569f8` 对 Logo 与代码高亮强制灰阶。此次只恢复色彩，不回退移动端布局或重建已退役的状态桥。

## 修复与回归设计

- 应用直接依赖固定在受支持的 Undici 7 系列（`^7.30.1`，安装审计无漏洞）。jsdom 的隔离嵌套 v8 不参与 Node fetch 的 dispatcher。新增本地 HTTP 真请求契约测试，覆盖 Agent 与 EnvHttpProxyAgent，防止依赖更新再次打断传输。不要仅 mock fetch 检查参数就认为传输兼容。
- 所有自定义 IP 桶（普通 API、认证、聊天、管理登录、媒体）通过同一 `rateLimitIpKey` 调用 `ipKeyGenerator`；保留用户 ID 优先与既有配额。新增 IPv6 同子网合桶、跨子网隔离、IPv4 稳定性测试。
- 恢复蓝色发送、链接、焦点和青绿头像，移除 Logo/代码强制灰阶。RN 颜色协议增加 action/onAction，避免再次把动作色与正文 ink 绑死。保留现有中性背景和布局。
- 修复附件 wiring 的 DOM 能力判定与无 document 时 CSRF 读取；测试 provider 与滚动状态改用实际模块 owner，而不是 window 假桥。已退役 chipSync/publisher 测试转而覆盖 React 当前使用的事件/状态契约。
- first-paint 白色与已批准的 paperCanvas 一致；主题测试明确检验浅色 page/elevated 共纸政策，深色仍为四个独立色阶，不降低对比度检查。

## 发布要求

无数据库 schema 变更，不需要新迁移。使用正常 `deploy.sh` 构建和单写者交换，保留健康门禁与回滚；服务端必须重新安装锁文件依赖并重启，单改前端不能修复传输。发布后除 `/health` 外，还要用实际 dispatcher 验证上游 HTTP 以及最小聊天生成；不得将凭证或用户会话内容写入日志。

远端历史 CI 不会因本地修改自动变绿；需要提交推送后才能得到新的 GitHub run。验证结果以执行记录为准，不把部署允许 advisory CI 等同于 CI 已通过。

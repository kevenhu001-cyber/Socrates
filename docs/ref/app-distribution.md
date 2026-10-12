# app.topodrive.top 分发与缓存

## 当前结论（2026-10-12）

- 源站 Nginx 直连响应约 10–40 ms；公网 `/` 冷请求观测到约 1.3–2.3 s TTFB。
- `app.topodrive.top` 的 DNS 当前由 Cloudflare 代理；`/cdn-cgi/trace` 显示 `loc=CN` 但 `colo=AMS`，中国访问会被送到欧洲边缘节点。
- JS/CSS 等带 hash 的资源已经 Brotli 压缩并可命中 CDN；SPA HTML `/` 当前是 `cf-cache-status: DYNAMIC`，每次导航都回源。
- `/api/v2/*`、登录态和 CSRF 请求必须保持不缓存，不能用 Cache Everything 覆盖它们。

## 应用侧策略

`ops/nginx/app-performance.conf.example` 和 `deploy.sh` 现在会给 SPA HTML 写入 60 秒的 `CDN-Cache-Control` / `Cloudflare-CDN-Cache-Control`，并保留旧资源 30 天。这样切换到支持按响应头缓存 HTML 的边缘节点后，首屏文档不会每次跨地域回源。

## 仍需在 CDN 控制台完成

Cloudflare 默认不缓存 HTML。若继续使用 Cloudflare，为 `app.topodrive.top` 建立 Cache Rule：

1. 仅匹配 `GET` / `HEAD`，排除 `/api/`、`/api/v2/`、`/.well-known/` 和带登录动态响应的路径。
2. Cache eligibility 设为 `Eligible for cache`，Edge TTL 设为 60 秒；浏览器 TTL 尊重源站响应头。
3. 开启 Tiered Cache。发布后检查 `/` 从 `DYNAMIC` 变为 `MISS` 后再变为 `HIT`。

如果主要用户在中国大陆，更直接的方案是把 `app` 子域接入腾讯 EdgeOne 并将 DNS 从 Cloudflare 代理切换到 EdgeOne 的加速 CNAME；或者临时将 `app` 设为 DNS-only 直连源站。该动作需要 DNS/CDN 控制台权限，代码仓库无法代替执行。

验证命令：

```bash
env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
  curl --noproxy '*' -fsSI -H 'Accept-Encoding: br' https://app.topodrive.top/ \
  | grep -iE 'cf-cache-status|cache-control|cdn-cache-control|content-encoding|server'
```

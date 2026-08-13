# 桌面端与安卓端构建/发布工作流

仓库将“构建”和“发布”拆成两个阶段：构建工作流只生成可审计的产物，发布工作流才创建 GitHub Release 或上传 Google Play。生产签名材料只在对应的 GitHub Actions job 内短暂存在，不写入仓库。

## 产物与入口

| 目标 | 构建入口 | 产物 |
| --- | --- | --- |
| React Native 桌面端（Expo Web） | `build-apk.yml` 的 `build-web-desktop` | `socrates-desktop-web-*.tar.gz` |
| Windows 原生桌面端（RNW） | `build-apk.yml` 的 `build-windows` | `.msix`/`.msixbundle`、`SHA256SUMS.txt` |
| React Native 安卓端 | `build-apk.yml` 的 `build-android` | APK、release AAB、SHA-256 |

手动构建（不发布）：

```bash
gh workflow run build-apk.yml --ref main \
  -f build_profile=debug \
  -f run_verification=true
gh run watch
```

Windows 原生包只在 Windows runner 上生成；Expo Web 桌面包可被部署到静态站点或作为版本附件分发。`build-windows.yml` 仍可用于单独调试 RNW shell；正式版本建议统一使用 `release-clients.yml`。

## 正式发布

正式发布由 `.github/workflows/release-clients.yml` 负责。它会先调用可复用的 `build-apk.yml`，执行前端、服务端、RN 检查，构建签名 Android APK/AAB、签名 Windows 包和桌面 Web 压缩包，然后创建 GitHub Release 并附带总校验文件。

推荐使用版本 tag：

```bash
git tag v2.1.0
git push origin v2.1.0
```

推 tag 前请同步更新 `mobile/app.json` 的 `expo.version` 和递增
`expo.android.versionCode`；Google Play 会拒绝重复的 versionCode。

也可以手动触发并指定 `release_tag`。带 `-rc` 或其他后缀的 tag 会自动标记为 prerelease。

### 必需的 Android Secrets

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

### 必需的 Windows Secrets

- `WINDOWS_PFX_BASE64`
- `WINDOWS_PFX_PASSWORD`
- `WINDOWS_PUBLISHER`（证书中的 Publisher 字符串，例如 `CN=Example, O=Example, C=US`）

Windows 证书应包含可用于 MSIX/AppX 签名的代码签名证书。构建结束后 PFX 会被删除，发布附件会先通过 `signtool verify /pa` 校验。

### Google Play（可选）

手动触发 `release-clients.yml` 时将 `publish_google_play` 设为 `true`，并配置 `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`。工作流会把 `com.topodrive.socrates` 的 release AAB 上传到 production track；未显式开启时只创建 GitHub Release，不会触碰 Play Console。

## 安全与回滚

- Pull Request 只走验证，不生成生产发布包。
- Release workflow 使用 `contents: write`，构建 workflow 仅使用 `contents: read`。
- APK/AAB、桌面压缩包和 Windows 包统一生成 SHA-256 清单。
- Release 失败不会创建半成品 GitHub Release；Google Play 上传是独立 job，可单独重试。Google Play 服务账号 JSON 只通过 Actions secret 注入，不写入产物。
- 数据库迁移仍须在服务端部署流程中先执行；客户端发布不会自动执行服务器迁移。

真实 Android 设备、Microsoft Store 认证和 Google Play 审核仍属于发布后的验收环节；CI emulator smoke 不能替代这些审核。

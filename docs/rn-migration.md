# React Native 全量迁移路线与验收基线

## 目标

将 `mobile/` 建设为 Socrates 的 React Native 主应用：Android 使用真正的
原生 RN 组件和导航，Web 逐步迁移到同一套 RN 组件，桌面端复用业务层并按
平台选择 React Native Windows 或 React Native macOS。现有 `frontend/` 在迁移
期间继续作为 Web 行为和视觉回归基准，不在没有验收的情况下删除。

## 当前架构

```text
server/                 Express API、认证、SSE、持久化
packages/contracts/     API 类型和跨客户端协议
packages/core/          SSE 分帧、聊天事件路由、会话/消息纯函数
mobile/                 Expo + React Native 主应用
frontend/               现有 Vite Web 基准，逐模块替换
```

Android 的原生主路径已经接通：登录、首页、聊天、Tutor、Library、Exam、
Settings、Search、More、Workspace、Share、Artifact Preview 均有 RN 路由。
Workspace 和 HTML artifact 仍通过明确隔离的 WebView 路由承载，属于迁移中的
兼容面，不是新的 WebView 壳架构。

## 分阶段计划

### 0. 建立基线

- 固定现有 Web 的 lint、单测、构建和关键 Playwright smoke 流程。
- 固定 API/OpenAPI 与 Android 兼容要求。
- 为每个 Web 功能建立对应的 RN 验收项和截图/交互记录。

### 1. RN 主壳与 Android 原生体验（已完成第一版）

- 用 RN Navigation 替换 Android 默认入口中的完整 WebView。
- 接通 auth bootstrap、网络状态、前后台恢复、主题、抽屉和硬件返回。
- 保留复杂编辑器/HTML 作品的局部 WebView 作为过渡边界。

平台适配边界已经拆开：Android 使用 Expo 原生模块，Web/Windows 为存储、网络、
通知、启动屏、剪贴板、朗读、深链和状态栏提供独立 fallback；共享屏幕不再直接
依赖这些 Expo-only 实现。

### 2. 共享核心（已完成第一版）

- `packages/core` 统一 SSE 分帧、聊天事件路由、消息文本和草稿会话。
- RN 与现有 Web 流式链路共用分帧器；Web 自己保留 Markdown、`<think>`、工具卡和
  可视化渲染逻辑。
- 共享协议必须保持无 DOM、无 React、无平台存储依赖。

### 3. 聊天体验对齐（第一轮已完成）

- 第一轮已经接通流式文本、推理块、工具调用、停止/重试、错误和离线恢复。
- RN 聊天已接通文件、相册、相机入口；共享 core 会在重试和后续历史请求中重建
  图片 `image_url` 与解析后的文本/PDF content parts。
- Markdown、代码、公式、viz/HTML 作品预览仍按组件逐项对齐。
- 每个差异都记录为 Web 基准与 RN 行为的可解释平台差异，不能用“移动端简化”
  代替验收。

### 4. 组织与学习功能

- 逐步替换 Workspace、项目、标签、归档、记忆、搜索和工作区协作。
- 把仍依赖 DOM 的编辑器或图形库封装成平台适配器；适配器不可污染共享核心。
- 每替换一个模块，删除对应的 WebView 入口，并保留回归用例。

### 5. Web 与桌面

- 用 Expo Web/RN Web 验证同一 RN 屏幕在浏览器的可用性，再按 Web 信息密度做
  响应式布局，而不是把 Android 尺寸直接放大到桌面。
- Windows 优先评估 React Native Windows；macOS 单独评估 React Native macOS。
- 桌面适配的环境要求和 Windows/macOS 验收项见 [`desktop/README.md`](../desktop/README.md)；
  当前 Linux 工作区只验证共享代码，不能宣称已经生成 WinAppSDK/Xcode 安装包。
- 桌面端共享 `packages/contracts`、`packages/core`、API 层和组件语义，允许
  使用键盘快捷键、多栏布局、窗口尺寸和文件系统等平台增强。
- 当前可交付的桌面产物是 Expo Web/RN Web bundle；它不是把移动页面套进一个完整
  SPA WebView。原生 Windows 壳仍需单独锁定 RN/RNW 版本并在 Windows runner 上
  生成、打包和验收，当前不把它标记为已完成。

## 功能验收清单

### Android / RN

- [x] `RN-AUTH-01` 登录、退出、启动恢复和 401 失效状态正确（代码/单测覆盖）。
- [x] `RN-CHAT-01` 新建会话、发送消息、SSE 增量、停止、重试和错误提示（代码/单测覆盖）。
- [x] `RN-CHAT-02` reasoning/tool 事件不会丢失，消息最终内容可持久化（共享核心/单测覆盖）。
- [x] `RN-CHAT-03` 附件可从文件、相册、相机进入；图片和解析文本会随会话保存并参与模型请求。
- [x] `RN-LIB-01` Recents、Library、Search 能打开同一会话并刷新状态（代码覆盖）。
- [x] `RN-EXAM-01` 考试生成、答题、提交和结果页可完成闭环（代码/单测覆盖）。
- [x] `RN-OFFLINE-01` 无网时显示缓存和离线状态，恢复网络后可刷新（native/Web storage adapter）。
- [x] `RN-NATIVE-01` 主流程不加载完整 SPA WebView；WebView 只存在于登记过的过渡面。
- [ ] `RN-BACK-01` Android 硬件返回、键盘、状态栏和安全区域符合系统习惯。

硬件返回的代码路径已接入（先关闭抽屉，再回退 RN navigation）；该项仍需真实
Android 设备对返回键、键盘、安全区域和状态栏做最终签收。

勾选“代码/单测覆盖”不等于真实设备签收；发布前仍需在 Android 设备上完成
触摸、键盘、返回键、网络切换和真实 API 的验收。

### Web 回归

- [x] `WEB-BASE-01` `npm run lint`、`npm run test:unit`、`npm run build` 通过。
- [ ] `WEB-BASE-02` 关键 Playwright smoke 覆盖登录、聊天、会话、搜索、分享和响应式布局（本次未改动既有 Web UI，需 CI/真实 API 环境继续跑）。
- [x] `WEB-CORE-01` Web 流式分帧与 RN 使用同一个 `packages/core` 实现。
- [x] `RN-WEB-01` Expo Web 桌面 bundle 在 GitHub Actions 中导出，并用 Chromium 桌面/移动视口
  做启动、登录入口和响应式 smoke；浏览器插件不可用时使用 Playwright fallback。

### 跨端协议与发布

- [x] `API-01` 修改服务端 API 时同步更新 `docs/api/openapi.yaml`。
- [ ] `API-02` RN、Web 对 SSE 事件名、错误结构和鉴权失效语义有契约测试。
- [x] `REL-01` Android/Web bundle export、Web build 和 mobile typecheck 已纳入 CI 工作流；本地只保留静态检查，不再作为 Android 原生构建机。
- [ ] `REL-02` 真实 Android 设备验收后，才关闭对应 WebView 过渡面。

## GitHub Actions 构建（推荐）

Android 原生构建和 Expo Web 桌面产物统一在 `.github/workflows/build-apk.yml` 中完成，
不依赖开发机的 Android SDK、NDK、JDK 或 Gradle 缓存。工作流固定 Java 17、Android
API 35、Build Tools 35.0.0 和 NDK 27.1.12297006。

手动触发 debug 构建（无需签名密钥，适合验收）：

```bash
gh workflow run build-apk.yml \
  --ref <branch> \
  -f build_profile=debug \
  -f run_verification=true
gh run watch
```

release 构建要求仓库 Secrets 中配置
`ANDROID_KEYSTORE_BASE64`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS` 和
`ANDROID_KEY_PASSWORD`：

```bash
gh workflow run build-apk.yml \
  --ref <branch> \
  -f build_profile=release \
  -f run_verification=true
gh run watch
```

成功后在 workflow run 的 Artifacts 中取得 Android APK/AAB、SHA-256 文件和 Expo Web
桌面 bundle。Pull Request 只执行校验，不生成发布包；push 到 `main` 会执行完整流水线，
其他分支通过上面的 `workflow_dispatch` 选择 debug 或 release 构建。

## 本地静态检查

```bash
cd mobile
npm run typecheck
npm test -- --watch=false
```

Web 基线仍按根目录 `AGENTS.md` 执行。以上 JavaScript 检查不替代 GitHub Actions
中的原生 APK/AAB 构建，也不替代真实设备验收；开发机不需要执行 Gradle 原生构建。

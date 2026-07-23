<div align="center">

<img src="docs/assets/hero.svg" alt="Socrates — AI 苏格拉底式导师" width="100%"/>

<br/>

[![仓库可见性](https://img.shields.io/badge/可见性-私有-7a6c4d?style=flat-square)](#-仓库可见性)
[![应用状态](https://img.shields.io/badge/应用-在线-d8a85b?style=flat-square)](https://app.topodrive.top/)
[![后端](https://img.shields.io/badge/后端-TypeScript%20%2B%20Node.js-3178c6?style=flat-square&logo=typescript&logoColor=white)](server/)
[![前端](https://img.shields.io/badge/前端-Vite%20SPA-f3c769?style=flat-square&logo=vite&logoColor=black)](frontend/)
[![Android](https://img.shields.io/badge/Android-Kotlin%20%2B%20Compose-3DDC84?style=flat-square&logo=android&logoColor=white)](android/)
[![数据库](https://img.shields.io/badge/数据库-PostgreSQL%2014%2B-4169e1?style=flat-square&logo=postgresql&logoColor=white)](server/src/db/)
[![许可](https://img.shields.io/badge/许可-专有-555555?style=flat-square)](#-许可)

**Socrates — AI 苏格拉底式学习助手**  
流式对话 + 推理模型、交互式 viz 画布、KaTeX 数学公式、
文档解析（PDF/DOCX/XLSX/PPTX/EPUB/RTF）、项目与标签、Agent 模式、
跨会话记忆、原生 Android 客户端。

[English version →](README.md) ·
[在线应用](https://app.topodrive.top/) ·
[OpenAPI 规范](docs/api/openapi.yaml) ·
[Android 构建](.github/workflows/build-apk.yml)

</div>

---

## 目录

- [为什么选择 Socrates](#-为什么选择-socrates)
- [截图](#-截图)
- [功能特性](#-功能特性)
- [架构](#-架构)
- [技术栈](#-技术栈)
- [仓库布局](#-仓库布局)
- [快速开始](#-快速开始)
  - [1. 前端（Vite SPA）](#1-前端vite-spa)
  - [2. 后端 API 服务](#2-后端-api-服务)
  - [3. Android 客户端](#3-android-客户端)
- [配置](#-配置)
- [自定义渲染管线](#-自定义渲染管线)
- [API 参考](#-api-参考)
- [部署](#-部署)
- [安全模型](#-安全模型)
- [仓库可见性](#-仓库可见性)
- [路线图](#-路线图)
- [贡献指南](#-贡献指南)
- [许可](#-许可)
- [支持](#-支持)

---

## 为什么选择 Socrates

大多数 AI 聊天界面只是一个文本框加一个日志。Socrates 的构建基于一个核心理念：**学习是苏格拉底式的行为，而不是问答行为**。项目内置的 `prompts/teacher-mode.md` 系统提示词将模型引导为一位耐心的老师——先用例子再讲概念，用引导式提问代替直接否定：

> 就像一位耐心温和的老师在跟你聊天。平时正常对话，不刻意教东西。
> - 对方问问题或遇到困难时，再拿出老师的引导感
> - 对方只是闲聊（比如打招呼），正常回应就好
> - 讲东西时先举例子再讲概念，用"换个角度想想"代替"你错了"
> - 偶尔用引导式提问代替直接给答案

其余的功能都是让苏格拉底体验更真实的管道：

- **流式对话** — 自定义逐行 Markdown 渲染器，`# Title` 在模型刚打出 `# ` 的瞬间就变成 `<h1>`
- **推理模型支持** — DeepSeek R1、QwQ 等模型的 `<think>…</think>` 思维链折叠展示
- **交互式 Viz 画布** — 对话框中输入 `` ```html `` 或 `` ```viz ``，模型即可交付沙箱隔离的交互式 HTML 作品
- **文档解析** — 支持 PDF、DOCX、XLSX、PPTX、EPUB、RTF 文件，提取后注入 LLM 上下文
- **项目管理、标签、归档、分享链接、自定义提示词、Cmd-K 搜索** — 学习工具应有的组织功能
- **自带 API Key** — 在"账号 → API 密钥"中配置 OpenAI / Anthropic / MiniMax 等任意兼容端点，后端代理请求，密钥不会暴露给浏览器

## 截图

市场站点（[`site/`](site/)）面向公众；SPA（`frontend/`）面向学习者。两者出自同一仓库。

<div align="center">

| 营销首页 | 定价 | 关于 |
| --- | --- | --- |
| ![Landing](index-v2.png) | ![Pricing](pricing-v2.png) | ![About](about-v2.png) |
| `index-v2.png` | `pricing-v2.png` | `about-v2.png` |

</div>

## 功能特性

### 对话与流式

- **逐行渐进式 Markdown** — ATX 标题、无序/有序列表、代码围栏、引用块、水平线、换行分段，以及行内加粗/斜体/代码/链接，全部流式渲染
- **推理块** — 思维链内容折叠为 `<details>`，前后 Markdown 保持正常 HTML 渲染
- **Viz / HTML 围栏** — `` ```html `` 或 `` ```viz `` 内容变为沙箱隔离的 iframe，不是 `<pre><code>`
- **KaTeX 数学公式** — 显示模式 `$$…$$` 和行内模式 `$…$`，解析失败时降级为转义文本
- **highlight.js** — 消息完成后对代码块高亮
- **消息工具栏** — 复制/编辑/删除/重新生成/评价，无需清空整条对话

### 组织功能

- **项目**（文件夹）— 侧边栏标签、拖拽排序、每个项目可设独立系统提示词
- **标签** — 每条对话可打多个标签、侧边栏筛选、支持"无标签"筛选
- **置顶** — 置顶项排在最近列表顶部
- **归档/回收站** — 30 天保留期，支持存储用量管理
- **自定义提示词** — 类似 Claude 的 Custom Instructions，localStorage + 服务端同步
- **Cmd-K / Ctrl-K 全局搜索** — 基于 fuse.js 的全库搜索
- **斜杠命令面板** — `/clear`、`/title`、`/regen` 等快捷命令
- **快捷键大全** — 配套速查表弹窗

### 后端

- **Express 5 + Drizzle ORM + PostgreSQL** — 类型化数据库模式
- **Cookie 认证** — `sid` cookie + CSRF 双重提交，注册验证、验证码、401 重放处理
- **自带 Key 的 LLM 代理** — 从任意 OpenAI 兼容端点流式获取响应，不记录明文密钥
- **文档提取** — 服务端解析 PDF、DOCX、XLSX、PPTX、EPUB、RTF，文本注入 LLM 上下文
- **Web 搜索** — MiniMax + Bing 并行竞速，SearXNG 降级备用，毫秒级响应
- **文件/图片上传** — `sharp` 生成缩略图
- **公开分享链接** — `/s/:token` 只读查看
- **用量跟踪** — Token 计数、计费仪表盘
- **跨会话记忆** — 模型可写入和重新读取的持久存储
- **推送通知** — FCM 新回复通知
- **团队工作区** — 多用户同一计费实体
- **语音转录** — 音频消息处理

### Android

- **Kotlin + Jetpack Compose** 原生客户端，共享同一后端
- 一个 Gradle 工作流自动构建 debug 和 release APK

### 市场与文档

- 市场站点含中文版（`site/zh/`）
- OpenAPI 规范在 `docs/api/openapi.yaml`
- Socratic 教师提示词原样收录在 `prompts/teacher-mode.md`

## 架构

系统是一个单页 Web 应用，通过小型 Node API 扇出到 OpenAI 兼容的 LLM 提供商。Android 客户端是同一 API 的轻量原生封装。

```mermaid
flowchart LR
  subgraph Client["客户端"]
    SPA["Web SPA<br/>(Vite + 原生 JS)"]
    APK["Android<br/>(Kotlin + Compose)"]
  end

  subgraph Edge["nginx (topodrive.top)"]
    APP["app.topodrive.top<br/>(静态 SPA)"]
    API["api.topodrive.top<br/>(反向代理)"]
  end

  subgraph Server["后端 (Node 22+ ESM)"]
    EX["Express 5"]
    AUTH["认证 + CSRF"]
    CHAT["对话 / Agent<br/>(SSE 流式)"]
    MEM["记忆 / 项目 / 标签 / 归档"]
    FILES["文件 / 上传 /<br/>文档提取"]
    WEB["Web 搜索<br/>(MiniMax+Bing+SearXNG)"]
    SHARE["分享 / 公开链接"]
  end

  DB[("PostgreSQL<br/>(Drizzle)")]
  LLM(["OpenAI 兼容<br/>LLM 提供商<br/>(用户自己的 Key)"])
  FCM(["FCM 推送"])

  SPA -->|HTTPS| APP
  SPA -->|HTTPS SSE / REST| API
  APK -->|HTTPS| API
  API --> EX
  EX --> AUTH
  EX --> CHAT
  EX --> MEM
  EX --> FILES
  EX --> WEB
  EX --> SHARE
  AUTH --> DB
  CHAT --> DB
  CHAT -->|流式补全| LLM
  MEM --> DB
  FILES --> DB
  WEB -->|并行| SE["搜索引擎"]
  SHARE --> DB
  EX -->|推送| FCM
```

### 单次对话数据流

```mermaid
sequenceDiagram
  autonumber
  participant U as 用户 (浏览器)
  participant SPA as SPA
  participant API as API (Express)
  participant DB as PostgreSQL
  participant LLM as LLM 提供商

  U->>SPA: 输入消息，点击发送
  SPA->>API: POST /api/chat/stream (SSE)
  API->>DB: 加载用户、会话、有效 API Key
  API->>LLM: POST /chat/completions (stream=true)
  loop 每个 SSE 块
    LLM-->>API: data: {delta}
    API-->>SPA: data: {delta}
    SPA->>SPA: 追加 delta 到气泡，<br/>原地重新渲染 Markdown
  end
  LLM-->>API: data: [DONE]
  API->>DB: 持久化助手消息
  API-->>SPA: SSE 结束
  SPA->>SPA: 最终完整渲染<br/>(KaTeX, highlight.js)
```

## 技术栈

| 层 | 技术 | 说明 |
| --- | --- | --- |
| Web SPA | 原生 JS + 可选 React 兼容层，Vite 构建 | [`frontend/`](frontend/) — 正在渐进迁移至 React/TypeScript |
| Markdown | `marked` 4.3 + 自定义渐进渲染器 | 见[自定义渲染管线](#-自定义渲染管线) |
| 数学公式 | `katex` 0.16.9 (CDN, SRI 固定) | 显示模式 + 行内模式 |
| 代码高亮 | `highlight.js`（完成时延迟加载） | |
| 搜索 | `fuse.js` 用于 Cmd-K 面板 | |
| 认证 | Cookie (`sid`) + CSRF 双重提交 | 见 `server/src/middleware/auth.ts` |
| 后端 | TypeScript, Express 5, Node.js ESM | [`server/src/`](server/src/) |
| ORM | Drizzle ORM 0.40+ + `drizzle-kit` | [`server/src/db/`](server/src/db/) |
| 数据库 | PostgreSQL 14+ | `DATABASE_URL` 环境变量 |
| LLM 代理 | `fetch` 到任意 OpenAI 兼容端点 | [`server/src/services/llm.ts`](server/src/services/llm.ts) |
| 文档解析 | mammoth, SheetJS, jszip+xml2js, EPub, rtf2text | [`server/src/services/fileParsers/`](server/src/services/fileParsers/) |
| Web 搜索 | MiniMax + Bing (并行竞速), SearXNG 降级 | [`server/src/services/webSearch.ts`](server/src/services/webSearch.ts) |
| 图片处理 | `sharp` 生成缩略图 | |
| 邮件 | `nodemailer` (SMTP) 用于验证和密码重置 | |
| 文件上传 | `multer` | |
| 代码执行 | Pyodide WASM (Python 沙箱) | [`server/src/services/codeInterpreter.ts`](server/src/services/codeInterpreter.ts) |
| Android UI | Jetpack Compose (Material 3) | [`android/app/src/main/`](android/app/src/main/) |
| Android 网络 | OkHttp + Kotlinx Serialization | |
| CI | GitHub Actions: push 到 `main` 时构建 APK | [`.github/workflows/build-apk.yml`](.github/workflows/build-apk.yml) |
| 边缘 | nginx 反向代理 + 静态文件服务 | [deploy.sh](deploy.sh) |
| CDN 依赖 | `cdn.jsdelivr.net` (KaTeX, marked) — 全部 SRI 固定 | |

## 仓库布局

```
Socrates/
├── frontend/               # Vite SPA (原生 JS, 模块化)
│   ├── index.html
│   ├── src/
│   │   ├── main.js         # 应用逻辑 (~9.8k 行)
│   │   ├── styles.css      # 全部 CSS (~3600 行)
│   │   ├── state.js        # 响应式状态对象
│   │   ├── attachments.js  # 文件附件处理
│   │   └── ...
│   ├── dist/               # 构建产物 (gitignored)
│   └── package.json
├── site/                   # 市场站点 (topodrive.top)
│   ├── index.html
│   ├── base.css
│   └── zh/                 # 中文版
├── server/                 # TypeScript / Express 5 / Drizzle / PostgreSQL
│   ├── package.json
│   ├── drizzle/            # 数据库迁移
│   └── src/
│       ├── index.js        # 稳定的生产兼容入口
│       ├── index.runtime.ts # 运行时入口
│       ├── app.ts          # Express 应用、中间件
│       ├── db/             # Drizzle schema、迁移、客户端
│       ├── lib/            # 错误处理、加密
│       ├── middleware/     # 认证、CSRF、错误处理
│       ├── routes/         # 认证、对话、会话、分享、文件……
│       └── services/       # LLM、Web 搜索、文件解析、代码执行……
├── android/                # Kotlin / Compose 客户端
│   ├── build.gradle.kts
│   └── app/
├── prompts/
│   └── teacher-mode.md     # 苏格拉底教师提示词（原样）
├── docs/
│   ├── api/openapi.yaml    # 完整 REST + SSE API 规范
│   └── assets/hero.svg     # README 英雄图片
├── deploy.sh               # nginx 部署脚本
├── README.md               # 英文版
└── README.zh.md            # 中文版
```

## 快速开始

需要启动三个部分：

1. **前端 SPA**（[`frontend/`](frontend/)）— Vite 开发服务器或构建产物
2. **后端 API 服务**（[`server/`](server/)）— Node 22+、PostgreSQL 14+
3. **LLM 提供商**（可选）— 用户在"账号 → API 密钥"中配置，或服务端设置 `BEAGLE_SYSTEM_KEY` 后自动内置

### 1. 前端（Vite SPA）

```bash
cd frontend
npm install
npm run dev        # 开发服务器 http://localhost:5173
# 或
npm run build      # 生产构建 → dist/
```

### 2. 后端 API 服务

```bash
cd server
npm install

# 配置环境变量
export DATABASE_URL="postgres://user:pass@localhost:5432/socrates"
export PORT=8080

# 执行数据库迁移
npm run db:migrate

# 运行开发服务器（自动重载）
npm run dev

# 或生产模式
npm run build
npm start
```

服务默认监听 `http://0.0.0.0:8080`。

### 3. Android 客户端

```bash
cd android
./gradlew assembleDebug                       # 调试构建
./gradlew assembleRelease \
  -PBASE_URL=https://app.topodrive.top/      # 正式构建，自定义 URL
```

CI 工作流在每次推送到 `main` 分支时自动构建 APK。

## 配置

全部通过服务端环境变量配置；SPA 不从磁盘读取配置（设置存储在 `localStorage`）。

| 变量 | 必需 | 默认值 | 用途 |
| --- | --- | --- | --- |
| `DATABASE_URL` | 是 | — | PostgreSQL 连接字符串 |
| `PORT` | 否 | `8080` | HTTP 监听端口 |
| `NODE_ENV` | 否 | `development` | `production` 开启 cookie `secure` 标志，禁用详细日志 |
| `COOKIE_DOMAIN` | 否 | 自动 | API 和 SPA 在不同子域时设置 |
| `COOKIE_SECURE` | 否 | 生产环境为 `true` | 强制 `sid` cookie 的 `Secure` 标志 |
| `BEAGLE_SYSTEM_KEY` | 否 | — | 设置后自动内置 "Beagle" LLM 提供商，新用户开箱即用 |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | 否 | — | 邮箱验证和密码重置必需 |
| `FCM_SERVER_KEY` | 否 | — | Android 客户端推送通知 |
| `BEAGLE_BUILT_IN.key` | 否 | 空 | 覆盖内置提供商密钥（优先级高于 `BEAGLE_SYSTEM_KEY`） |

用户在"账号 → API 密钥"中自行配置提供商，后端不会记录明文密钥。

## 自定义渲染管线

Socrates 内置**两套** Markdown 渲染器，根据模型是否完成回复切换使用：

| 渲染器 | 位置 | 使用时机 |
| --- | --- | --- |
| `formatMsgProgressive` | `frontend/src/main.js` | 流式输出中，每帧执行。逐行状态机，不依赖 `marked` |
| `formatMsg` | `frontend/src/main.js` | `finish()` 时、重新打开已保存消息、复制/导出时。完整管线：`marked` + KaTeX + highlight.js + viz iframe + 推理块处理 |

核心设计原则：

- **块级元素在开标签出现的瞬间即渲染** — `# ` 空格按下的同一帧就变为 `<h1>`
- **`<think>…</think>` 片段也渲染为 HTML** — 推理块前的内容进入 `think-prefix`，之后的内容进入 `think-suffix`
- **每帧级别的聊天模板工件剥离** — 某些推理模型会泄露 `<|im_start|>…<|im_end|>` 或 `[INST]…[/INST]`，`stripChatArtifacts()` 每帧运行一次
- **使用 nonce 占位符进行转义** — 避免纯文本中的 `<code>` 等字符串被错误解析

## API 参考

完整 REST + SSE 规范在 [`docs/api/openapi.yaml`](docs/api/openapi.yaml)（OpenAPI 3.1）。对话流式接口简版：

```http
POST /api/chat/stream
Cookie: sid=...
X-CSRF-Token: ...
Content-Type: application/json

{
  "sessionId": "uuid",
  "messages": [{"role": "user", "content": "解释贝叶斯定理"}],
  "model": "gpt-4o-mini",
  "temperature": 0.7,
  "maxTokens": 4096
}
```

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream

data: {"delta":"贝"}
data: {"delta":"叶"}
data: {"delta":"斯..."}
data: [DONE]
```

其他重要端点：`/api/agent/run`（工具型 Agent）、`/api/search`（Cmd-K 搜索）、`/api/fetch-batch`（URL 抓取）、`/api/files/extract`（文档文本提取）、`/api/share/:token`（公开只读分享）、`/api/memory/*`（跨会话记忆）、`/api/usage/*`（用量跟踪）、`/api/agent/files/*`（Agent 工作区文件访问）。

## 部署

[`deploy.sh`](deploy.sh) 是生产环境的规范部署脚本：

1. 通过 `npm ci --include=dev` 安装前后端 lockfile 锁定的依赖
2. 构建 Vite SPA（`npm run build`）并将 `dist/` 复制到 `/var/www/app.topodrive.top/`
3. 将 TypeScript 后端编译到独立的候选目录（`server/.dist-next.<rand>/`），编译成功后才替换为 `server/dist/`，旧版本保留为 `dist.previous/` 用于一键回滚。`server/src/index.js`（稳定的 systemd shim）会委托给 `dist/index.runtime.js`
4. 构建并将市场站点复制到 `/var/www/topodrive.top/`
5. 通过 `systemctl restart socrates-api` 重启后端。如果重启或重启后的健康检查失败，脚本会自动恢复上一次的后端构建，再以非零状态退出 —— 操作员不需要手工追踪半部署的二进制
6. 校验部署门禁（前端 `index.html` MD5、本机可访问 `/api/health`）并写入状态文件。门禁失败时保留上一次已知良好的状态，并打印准确的回滚命令

```bash
./deploy.sh                              # 构建 + 部署
```

后端以 systemd unit 运行（`Restart=always`）。后端除 PostgreSQL 外无状态，水平扩展只需在 nginx 后增加进程。

Android 客户端由 GitHub Actions 自动构建，产物可在 Actions 页下载。

## 安全模型

- **认证** — 密码 bcrypt 哈希。会话为 `sid` cookie 中的 64 字符随机令牌，`HttpOnly` + `SameSite=Lax`，服务端强制过期
- **CSRF** — 双重提交 cookie 模式。`csrf` cookie 由 SPA 读取并回传至 `X-CSRF-Token` 头
- **API 密钥** — 静态加密存储，SPA 仅显示掩码预览（`sk-…abcd`），代理仅在单次请求期间内存中持有密钥
- **Viz iframe** — 沙箱隔离（`sandbox="allow-scripts"`，默认不含 `allow-same-origin`），恶意 HTML 无法接触父 DOM 或用户 cookie
- **文档上传** — 非图片文件通过 `Content-Disposition: attachment` 强制下载；HTML/XHTML 上传在 multer 层面拦截
- **CSP** — 生产环境建议在 nginx 层配置，SPA 未内置
- **邮箱验证** — 创建首条对话前必需，按 IP 限制速率

## 仓库可见性

本仓库为**私有仓库**。公开面包括：

- 市场站点 <https://topodrive.top/>
- 在线应用 <https://app.topodrive.top/>
- Android 客户端的 Google Play 页面（发布后）

如果你已获得访问权限，请勿公开仓库内容 — SPA 包含苏格拉底教师提示词原文、Agent 工具实现和自定义渲染管线，目前保持专有。

## 路线图

按优先级大致排序，无确切日期：

- [x] **文档提取** — PDF、DOCX、XLSX、PPTX、EPUB、RTF 解析
- [x] **Web 搜索** — 低延迟并行搜索 + 降级机制
- [x] **内存/性能优化** — 降低受限服务器的内存占用
- [x] **SSE 可靠性** — 静默看门狗、正确错误事件、优雅超时
- [ ] **更好的 RAG** — 跨会话向量索引，实现智能上下文检索
- [ ] **工作区共享** — 实时协同编辑
- [ ] **移动端 PWA** — manifest + service worker
- [ ] **沙箱代码执行** — 在 viz 沙箱中运行 Python 片段
- [ ] **单条消息成本估算** — 根据提供商定价端点计算

## 贡献指南

目前不接受核心团队以外的 PR。如有功能请求或 Bug 报告，请发邮件至 [help@addtech.site](mailto:help@addtech.site)

核心贡献者工作流：

1. 从 `main` 切出分支（`git checkout -b pX.Y/short-name`）
2. 完成修改，保持改动范围聚焦
3. 运行 linter：`cd server && npm run lint`
4. 推送并创建 PR
5. 通过 squash 合并

## 许可

专有。保留所有权利。最终用户条款见 [site/terms.html](site/terms.html)；源代码许可在公开发布前为"仅限内部使用"。

## 支持

- **应用问题** — 发邮件至 [help@addtech.site](mailto:help@addtech.site) 或使用应用内帮助
- **API 规范问题** — 先阅读 [`docs/api/openapi.yaml`](docs/api/openapi.yaml)
- **Android 构建失败** — CI 工作流日志包含 Gradle 堆栈；最常见原因是 Kotlin Compose 版本升级后 Android SDK 缓存过期

<div align="center">

用心构建，为每一位学习者。

[English version →](README.md)

</div>

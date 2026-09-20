# Socrates 前端统一计划

> **⚠️ SUPERSEDED（2026-09-04）** — 本计划已被 `docs/adr/0001-spa-react-alignment.md`
> 搁置：Web 端保留 Vite SPA 并完成 React/TS 化，不再迁入 Expo Web。
> `mobile/` 继续作为原生客户端。本文档保留作为历史参考，勿按此执行。

## 目标
将 `frontend/` (Vite SPA) 完全迁移到 `mobile/` (Expo + React Native)，实现单一代码库支持 Android + Web。

## 当前进度
- ✅ 60% - Android 原生核心流程已完成
- ✅ 40% - 共享核心逻辑已抽取
- 🔄 20% - Web 端迁移进行中

## 统一路线图

### Phase 1: 渲染层统一 (2-3周)
**目标：** 将 `frontend/src/render/` 的 Markdown 渲染迁移到 RN

- [ ] **Step 1.1** 分析 frontend 的渲染器差异
  ```bash
  # 对比两个渲染实现
  diff frontend/src/main.js mobile/src/render/
  ```

- [ ] **Step 1.2** 创建跨平台渲染适配器
  ```typescript
  // mobile/src/render/markdown-adapter.tsx
  // 使用 react-native-render-html 或自定义方案
  ```

- [ ] **Step 1.3** 迁移关键功能
  - [ ] 流式 Markdown 渲染 (`formatMsgProgressive`)
  - [ ] `<think>` 块折叠
  - [ ] 代码高亮 (highlight.js → react-native-syntax-highlighter)
  - [ ] KaTeX 数学公式 (→ react-native-mathjax-html-to-text-svg)
  - [ ] Viz/HTML iframes (→ WebView 或 SVG 替代)

- [ ] **Step 1.4** E2E 测试对比
  ```bash
  # 确保渲染效果一致
  npm run test:render -- --compare-snapshots
  ```

### Phase 2: 移除 WebView 依赖 (3-4周)
**目标：** 将所有 WebView 改为纯 RN 组件

- [ ] **Step 2.1** Workspace 编辑器
  - 当前：WebView 加载富文本编辑器
  - 目标：使用 `react-native-webview` + 受控接口或原生方案

- [ ] **Step 2.2** HTML Artifacts
  - 当前：iframe 沙箱
  - 目标：
    - 简单 viz → react-native-svg
    - 复杂 HTML → 受控 WebView (仅此场景)

- [ ] **Step 2.3** 图表渲染
  - echarts → react-native-echarts-wrapper
  - plotly → react-native-plotly

### Phase 3: Web 端迁移 (2-3周)
**目标：** 用 Expo Web 替代 frontend/

- [ ] **Step 3.1** 响应式布局适配
  ```typescript
  // mobile/src/theme/responsive.ts
  import { useWindowDimensions } from 'react-native';
  
  export const useResponsive = () => {
    const { width } = useWindowDimensions();
    return {
      isMobile: width < 768,
      isTablet: width >= 768 && width < 1024,
      isDesktop: width >= 1024,
    };
  };
  ```

- [ ] **Step 3.2** 构建 Web 版本
  ```bash
  cd mobile
  npm run export:web
  # 输出到 web-build/
  ```

- [ ] **Step 3.3** Nginx 配置切换
  ```nginx
  # 新配置指向 mobile/web-build/
  location / {
    root /var/www/mobile-web-build;
    try_files $uri $uri/ /index.html;
  }
  ```

- [ ] **Step 3.4** A/B 测试
  - 保留 frontend/ 作为 fallback
  - 部分流量切到 Expo Web
  - 监控错误率和性能

### Phase 4: 清理与优化 (1-2周)
**目标：** 删除冗余代码，优化构建

- [ ] **Step 4.1** 删除 frontend/
  ```bash
  # 确认 Expo Web 稳定后
  git rm -rf frontend/
  ```

- [ ] **Step 4.2** 更新部署脚本
  ```bash
  # deploy.sh 改为构建 mobile/
  cd mobile
  npm run export:web
  npm run export:android
  ```

- [ ] **Step 4.3** 更新文档
  - README.md 移除 frontend 章节
  - 更新架构图

- [ ] **Step 4.4** CI/CD 优化
  ```yaml
  # .github/workflows/deploy.yml
  - name: Build unified app
    run: |
      cd mobile
      npm run export:web
      npm run export:android
  ```

## 技术难点与解决方案

### 1. Markdown 流式渲染
**问题：** RN 没有 `innerHTML`，无法直接用 DOM 渲染

**方案：**
- 使用 `react-native-render-html` 解析 HTML
- 或自建 AST → RN 组件映射
```typescript
// mobile/src/render/progressive-renderer.tsx
export const ProgressiveMarkdown = ({ content }: { content: string }) => {
  const ast = parseMarkdownAST(content);
  return <>{renderAST(ast)}</>;
};
```

### 2. 代码高亮
**问题：** highlight.js 依赖 DOM

**方案：**
```bash
npm install react-native-syntax-highlighter
```

### 3. KaTeX 数学公式
**问题：** KaTeX 需要 DOM 和 CSS

**方案：**
```bash
npm install react-native-mathjax-html-to-svg
# 或使用 WebView 局部渲染
```

### 4. HTML Artifacts 沙箱
**问题：** iframe 沙箱在 RN 中不存在

**方案：**
```typescript
import { WebView } from 'react-native-webview';

<WebView
  source={{ html: artifactHTML }}
  sandbox="allow-scripts"  // Web 平台支持
  style={{ flex: 1 }}
/>
```

### 5. 响应式布局
**问题：** RN 默认是移动端布局

**方案：**
```typescript
// mobile/src/theme/layout.tsx
import { Platform, Dimensions } from 'react-native';

export const Layout = ({ children }: { children: ReactNode }) => {
  const { width } = Dimensions.get('window');
  const isWeb = Platform.OS === 'web';
  const columns = isWeb && width > 1024 ? 3 : 1;
  
  return <View style={{ flexDirection: columns > 1 ? 'row' : 'column' }}>
    {children}
  </View>;
};
```

## 验收标准

### 功能对等
- [ ] 所有 frontend 功能在 mobile (Web) 中可用
- [ ] 流式聊天性能 ≤ frontend
- [ ] Markdown 渲染准确率 100%

### 性能指标
- [ ] Web 首屏加载 < 2s
- [ ] Android APK 大小 < 50MB
- [ ] 流式渲染帧率 ≥ 30fps

### 浏览器兼容
- [ ] Chrome/Edge (最新版)
- [ ] Firefox (最新版)
- [ ] Safari (最新版)
- [ ] 移动浏览器 (iOS Safari, Android Chrome)

## 时间估算
- Phase 1: 2-3周
- Phase 2: 3-4周
- Phase 3: 2-3周
- Phase 4: 1-2周

**总计：8-12周（2-3个月）**

## 风险与缓解

### 风险1：RN Web 性能不如 Vite SPA
**缓解：**
- 使用 Hermes 引擎优化
- 代码分割和懒加载
- 关键路径优化

### 风险2：某些 Web 库无 RN 替代
**缓解：**
- 保留受控 WebView 作为后备
- 自行实现或寻找替代库

### 风险3：用户体验回退
**缓解：**
- A/B 测试逐步切换
- 保留 frontend 作为 fallback
- 充分测试后再全量

## 下一步行动

立即开始：
```bash
# 1. 创建功能对比表
cd mobile
npm run compare-features

# 2. 开始渲染层迁移
mkdir -p src/render/unified
touch src/render/unified/markdown-renderer.tsx

# 3. 设置测试基准
npm run test:baseline
```

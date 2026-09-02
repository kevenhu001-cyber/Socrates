# Frontend → React Native 完全改造方案

## 执行摘要

**目标：** 将 `frontend/` (10k行 legacy JS + React/TS) 改造为 React Native 应用

**预计时间：** 4-6 个月（全职 2-3 人团队）

**风险等级：** 🔴 **高风险** - 需要重写核心架构

## 为什么这比迁移到 mobile/ 更难？

| 维度 | 迁移到 mobile/ (当前方案) | 改造 frontend/ (用户提议) |
|------|--------------------------|-------------------------|
| **架构基础** | ✅ mobile/ 已是纯 RN 架构 | ❌ frontend/ 是 Web 架构 |
| **DOM 依赖** | ✅ 已移除 | ❌ 664+ 处需要重写 |
| **main.js** | ✅ 不存在 | ❌ 10k 行需要拆解 |
| **渲染器** | ✅ 已用 RN 组件 | ❌ 自定义 DOM 渲染器 |
| **现有进度** | ✅ 60% 完成 | ❌ 0% |
| **工作量** | 2-3 个月 | **4-6 个月** |

## 改造路线图

### Phase 0: 架构重构准备 (2-3周)

#### 0.1 依赖审计
```bash
cd frontend

# 1. 列出所有浏览器专属 API
grep -r "document\.\|window\.\|localStorage\|sessionStorage\|innerHTML" src/ > audit/browser-apis.txt

# 2. 分析 main.js 的职责
node scripts/analyze-main-js.mjs > audit/main-js-responsibilities.json

# 3. 识别无法直接移植的库
npm list | grep -E "dom|browser|web-only" > audit/web-only-deps.txt
```

**输出产物：**
- `audit/browser-apis.txt` - 所有浏览器 API 调用点
- `audit/refactor-plan.md` - 重构计划
- `audit/migration-map.xlsx` - 文件级迁移映射表

#### 0.2 创建 RN 项目脚手架
```bash
# 方案 A: Expo (推荐)
npx create-expo-app@latest frontend-rn --template blank-typescript

# 方案 B: React Native CLI
npx react-native init FrontendRN --template react-native-template-typescript

cd frontend-rn
npm install @react-navigation/native @react-navigation/native-stack
npm install react-native-gesture-handler react-native-reanimated
```

#### 0.3 建立测试基线
```bash
# 在 frontend/ 中建立截图基线
cd ../frontend
npm run test:smoke -- --update-snapshots

# 记录所有功能的预期行为
node scripts/generate-behavior-baseline.mjs > ../frontend-rn/tests/baseline.json
```

---

### Phase 1: 核心架构重构 (4-6周)

#### 1.1 拆解 main.js (10k行 → 模块化)

**当前问题：**
```javascript
// frontend/src/main.js - 10,051 行单一文件
// - 事件总线
// - 状态管理
// - DOM 操作
// - 业务逻辑
// - UI 更新
// - 副作用处理
```

**目标架构：**
```
frontend-rn/src/
├── state/
│   ├── chatStore.ts         # 聊天状态 (Zustand/Redux)
│   ├── sessionStore.ts      # 会话管理
│   ├── authStore.ts         # 认证状态
│   └── uiStore.ts           # UI 状态
├── services/
│   ├── api.ts               # API 调用
│   ├── streaming.ts         # SSE 流式处理
│   └── storage.ts           # 存储适配器
├── hooks/
│   ├── useChatRuntime.ts    # 聊天运行时
│   └── useMessages.ts       # 消息管理
└── components/
    ├── MessageList/
    ├── Composer/
    └── Sidebar/
```

**实施步骤：**

```typescript
// 1. 选择状态管理方案 (Zustand 推荐 - 轻量且 RN 友好)
npm install zustand

// 2. 创建核心 Store
// frontend-rn/src/state/chatStore.ts
import { create } from 'zustand';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  rawText?: string;
  html?: string;
  streaming?: boolean;
}

interface ChatState {
  messages: Message[];
  currentSessionId: string | null;
  isStreaming: boolean;
  
  // Actions
  addMessage: (msg: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  setStreaming: (streaming: boolean) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  currentSessionId: null,
  isStreaming: false,
  
  addMessage: (msg) => set((state) => ({
    messages: [...state.messages, msg],
  })),
  
  updateMessage: (id, updates) => set((state) => ({
    messages: state.messages.map((m) =>
      m.id === id ? { ...m, ...updates } : m
    ),
  })),
  
  setStreaming: (streaming) => set({ isStreaming: streaming }),
}));
```

**迁移清单：**
- [ ] 从 main.js 提取状态管理 → Zustand stores
- [ ] 从 `window.__socrates*Bridge` 提取事件 → React Context
- [ ] 从全局函数提取业务逻辑 → 纯函数 + hooks
- [ ] 移除所有 `document.*` 调用 → RN 组件状态

#### 1.2 重写渲染管道

**最大挑战：** `formatMsgProgressive` 和 `formatMsg` 直接操作 DOM

**当前实现 (Web):**
```javascript
// frontend/src/main.js
function formatMsgProgressive(text) {
  let html = '';
  // 直接生成 HTML 字符串
  html += '<h1>' + line + '</h1>';
  // ...
  container.innerHTML = html; // ❌ RN 没有 innerHTML
}
```

**RN 实现方案：**

```typescript
// frontend-rn/src/render/MarkdownRenderer.tsx
import React from 'react';
import { View, Text } from 'react-native';
import Markdown from 'react-native-markdown-display';

interface MarkdownRendererProps {
  content: string;
  streaming?: boolean;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  streaming = false,
}) => {
  if (streaming) {
    // 流式渲染：逐块解析
    const blocks = parseProgressiveMarkdown(content);
    return (
      <View>
        {blocks.map((block, idx) => (
          <MarkdownBlock key={idx} block={block} />
        ))}
      </View>
    );
  }
  
  // 完整渲染
  return (
    <Markdown
      style={markdownStyles}
      rules={customRules}
    >
      {content}
    </Markdown>
  );
};

// 替代方案：使用 react-native-render-html
import RenderHTML from 'react-native-render-html';

export const HTMLRenderer: React.FC<{ html: string }> = ({ html }) => {
  const { width } = useWindowDimensions();
  return (
    <RenderHTML
      contentWidth={width}
      source={{ html }}
    />
  );
};
```

**库选择：**
```bash
# 方案 A: Markdown 原生渲染 (推荐)
npm install react-native-markdown-display

# 方案 B: HTML 渲染 (兼容性更好)
npm install react-native-render-html

# 方案 C: WebView (最后手段)
# Expo 自带 react-native-webview
```

**迁移策略：**
1. **第一阶段**：用 WebView 包装现有渲染器（快速验证）
2. **第二阶段**：逐步替换为原生 Markdown 组件（性能优化）
3. **第三阶段**：自定义流式渲染器（最终目标）

#### 1.3 存储层适配

```typescript
// frontend-rn/src/services/storage.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

// 统一存储接口 (兼容 Web localStorage)
export const storage = {
  async getItem(key: string): Promise<string | null> {
    return AsyncStorage.getItem(key);
  },
  
  async setItem(key: string, value: string): Promise<void> {
    return AsyncStorage.setItem(key, value);
  },
  
  async removeItem(key: string): Promise<void> {
    return AsyncStorage.removeItem(key);
  },
};

// 敏感信息存储 (API keys, tokens)
export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    return SecureStore.getItemAsync(key);
  },
  
  async setItem(key: string, value: string): Promise<void> {
    return SecureStore.setItemAsync(key, value);
  },
};
```

**批量迁移工具：**
```bash
# 替换所有 localStorage 调用
node scripts/replace-storage-apis.mjs
```

---

### Phase 2: 组件迁移 (6-8周)

#### 2.1 React 组件转换规则

**Web → RN 映射表：**

| Web | React Native | 注意事项 |
|-----|-------------|---------|
| `<div>` | `<View>` | 基础容器 |
| `<span>`, `<p>` | `<Text>` | 文本必须在 Text 中 |
| `<input>` | `<TextInput>` | 受控组件模式 |
| `<button>` | `<TouchableOpacity>` | 需要添加 activeOpacity |
| `<img>` | `<Image>` | source 属性不同 |
| `<a>` | `<Linking>` | 需要调用 API |
| CSS | `StyleSheet` | 对象形式 |
| `onClick` | `onPress` | 事件名不同 |
| `className` | `style` | 样式直接传递 |
| `innerHTML` | ❌ 不存在 | 使用组件组合 |

**自动化转换脚本：**
```bash
# frontend-rn/scripts/convert-component.mjs
node scripts/convert-component.mjs ../frontend/src/react/MessageList.tsx
```

**转换示例：**

```tsx
// BEFORE (Web)
// frontend/src/react/message-list/MessageItem.tsx
import './MessageItem.css';

export const MessageItem = ({ message }) => {
  return (
    <div className="message-item" onClick={() => handleClick()}>
      <div className="message-avatar">
        <img src={message.avatar} alt="avatar" />
      </div>
      <div className="message-content">
        <p>{message.text}</p>
      </div>
    </div>
  );
};
```

```tsx
// AFTER (RN)
// frontend-rn/src/components/MessageItem.tsx
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';

export const MessageItem = ({ message }) => {
  return (
    <TouchableOpacity style={styles.container} onPress={handleClick}>
      <View style={styles.avatar}>
        <Image source={{ uri: message.avatar }} style={styles.avatarImage} />
      </View>
      <View style={styles.content}>
        <Text style={styles.text}>{message.text}</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#fff',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },
  content: {
    flex: 1,
  },
  text: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
  },
});
```

#### 2.2 CSS → StyleSheet 转换

**工具链：**
```bash
npm install --save-dev react-native-css-transformer
npm install styled-components  # 或 @emotion/native
```

**方案 A: 手动转换 (精确控制)**
```bash
# 批量转换工具
node scripts/css-to-stylesheet.mjs frontend/src/styles.css > frontend-rn/src/styles.ts
```

**方案 B: styled-components (保持写法)**
```typescript
import styled from 'styled-components/native';

const MessageContainer = styled.View`
  flex-direction: row;
  padding: 12px;
  background-color: #fff;
`;

const MessageText = styled.Text`
  font-size: 16px;
  line-height: 24px;
  color: #333;
`;
```

#### 2.3 组件迁移优先级

**关键路径（按优先级）：**
1. ✅ **MessageList** - 聊天核心
2. ✅ **Composer** - 输入框
3. ✅ **Sidebar** - 会话列表
4. ⏳ **Settings** - 设置页
5. ⏳ **ShareModal** - 分享弹窗
6. ⏳ **Canvas/Viz** - 可视化（WebView 过渡）

---

### Phase 3: 高级功能适配 (4-6周)

#### 3.1 Markdown 流式渲染

**挑战：** `formatMsgProgressive` 的逐行渲染在 RN 中性能低

**解决方案：**
```typescript
// frontend-rn/src/render/StreamingMarkdown.tsx
import { useState, useEffect } from 'react';
import { View, Text } from 'react-native';

export const StreamingMarkdown = ({ stream }: { stream: string }) => {
  const [blocks, setBlocks] = useState<Block[]>([]);
  
  useEffect(() => {
    // 增量解析：只处理新增部分
    const newBlocks = parseIncrementalMarkdown(stream, blocks);
    setBlocks(newBlocks);
  }, [stream]);
  
  return (
    <View>
      {blocks.map((block, idx) => (
        <MarkdownBlock key={idx} block={block} />
      ))}
    </View>
  );
};
```

**优化策略：**
- 使用 `React.memo` 避免重新渲染旧块
- 使用 `FlatList` 虚拟化长消息
- 使用 `InteractionManager` 延迟非关键渲染

#### 3.2 KaTeX 数学公式

```bash
npm install react-native-mathjax-html-to-svg
# 或
npm install react-native-webview  # 在 WebView 中渲染
```

```typescript
// frontend-rn/src/components/MathFormula.tsx
import MathJax from 'react-native-mathjax-html-to-svg';

export const MathFormula = ({ formula, inline = false }: Props) => {
  const wrapped = inline ? `$${formula}$` : `$$${formula}$$`;
  
  return (
    <MathJax
      html={wrapped}
      mathJaxOptions={{
        messageStyle: 'none',
        extensions: ['tex2jax.js'],
        jax: ['input/TeX', 'output/HTML-CSS'],
      }}
    />
  );
};
```

#### 3.3 代码高亮

```bash
npm install react-native-syntax-highlighter
```

```typescript
import SyntaxHighlighter from 'react-native-syntax-highlighter';
import { docco } from 'react-syntax-highlighter/styles/hljs';

<SyntaxHighlighter
  language="javascript"
  style={docco}
>
  {code}
</SyntaxHighlighter>
```

#### 3.4 Viz/Canvas 沙箱

**过渡方案：**
```typescript
import { WebView } from 'react-native-webview';

export const VizCanvas = ({ html }: { html: string }) => {
  const sandboxedHTML = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
      </head>
      <body>${html}</body>
    </html>
  `;
  
  return (
    <WebView
      source={{ html: sandboxedHTML }}
      style={{ height: 400 }}
      javaScriptEnabled={true}
      domStorageEnabled={false}  // 安全沙箱
    />
  );
};
```

**终极方案：** 用 react-native-svg 或 react-native-skia 重写

---

### Phase 4: 导航和路由 (2周)

```typescript
// frontend-rn/src/navigation/AppNavigator.tsx
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

const Stack = createNativeStackNavigator();

export const AppNavigator = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Chat" component={ChatScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
```

---

### Phase 5: 平台适配 (2-3周)

#### 5.1 Web 支持 (Expo Web)

```bash
cd frontend-rn
expo start --web  # 自动生成 Web 版本
```

#### 5.2 响应式布局

```typescript
import { useWindowDimensions, Platform } from 'react-native';

export const useResponsive = () => {
  const { width, height } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  
  return {
    isMobile: width < 768,
    isTablet: width >= 768 && width < 1024,
    isDesktop: width >= 1024 && isWeb,
    columns: width > 1024 ? 3 : width > 768 ? 2 : 1,
  };
};
```

---

## 工作量估算

### 人力需求
- **主力开发** × 2人（全职）
- **架构师/技术负责人** × 1人（全职）
- **QA 测试** × 1人（兼职）

### 时间线（全职团队）

| 阶段 | 工作周 | 关键产出 |
|------|--------|---------|
| Phase 0 | 2-3周 | 依赖审计、脚手架 |
| Phase 1 | 4-6周 | 核心架构重构 |
| Phase 2 | 6-8周 | 组件迁移完成 |
| Phase 3 | 4-6周 | 高级功能适配 |
| Phase 4 | 2周 | 导航路由 |
| Phase 5 | 2-3周 | 平台适配 |
| **总计** | **20-28周** | **4-6个月** |

---

## 风险评估

### 🔴 高风险
1. **main.js 的 10k 行代码** - 需要完全重构状态管理
2. **自定义 DOM 渲染器** - 664+ 处 DOM 操作需要重写
3. **性能回退** - RN 渲染性能可能不如优化过的 Web
4. **生态库缺失** - 某些 Web 库没有 RN 替代品

### 🟡 中风险
1. **学习曲线** - 团队需要熟悉 RN 生态
2. **测试覆盖** - E2E 测试需要重写
3. **CI/CD 调整** - 构建流程需要重构

### 🟢 可控风险
1. **类型安全** - TypeScript 已有，迁移友好
2. **API 层** - 网络请求无需变更
3. **业务逻辑** - 纯函数可直接复用

---

## 对比：改造 frontend VS 继续 mobile

| 维度 | 改造 frontend/ | 继续 mobile/ |
|------|---------------|-------------|
| **时间** | 4-6 个月 | 2-3 个月 |
| **风险** | 🔴 高 | 🟡 中 |
| **代码复用** | 30-40% | 60-70% |
| **架构清晰度** | ⭐⭐⭐⭐ (全新) | ⭐⭐⭐ (已有) |
| **技术债** | ✅ 清零 | 🔄 部分遗留 |
| **团队熟悉度** | ❌ 需学习 RN | ✅ 已熟悉 |

---

## 我的建议

### ❌ **不推荐**改造 frontend/，原因：

1. **工作量翻倍**：4-6个月 vs 2-3个月
2. **高风险**：10k 行 main.js 需要完全重构
3. **现有进度丢失**：mobile/ 已完成 60%
4. **生态挑战**：很多 Web 库没有 RN 对应

### ✅ **推荐**继续 mobile/ 路线，但可以：

**借鉴 frontend 的优秀部分：**
```bash
# 1. 复用 frontend 的渲染逻辑（通过适配层）
cp -r frontend/src/render mobile/src/render-web-compat

# 2. 复用 frontend 的业务逻辑（纯函数）
cp -r frontend/src/chat mobile/src/services/chat

# 3. 复用 frontend 的类型定义
cp -r frontend/src/types mobile/src/types/legacy
```

**最佳策略：**
```
mobile/ (主力 RN 应用)
  ↓
packages/shared-logic/  ← 从 frontend 提取业务逻辑
  ↓
packages/rendering/     ← 抽象渲染层（支持 Web + RN）
```

---

## 如果一定要改造 frontend，下一步

我可以帮你：
1. ✅ 生成详细的依赖审计报告
2. ✅ 创建自动化迁移脚本
3. ✅ 建立 Web ↔ RN 组件映射表
4. ✅ 搭建 RN 项目脚手架

想从哪个开始？

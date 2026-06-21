# Socrates UI/UX 升级行动方案

## 执行摘要

基于对当前Socrates应用的分析和对ChatGPT、Kimi等成熟产品的研究，本方案提供了从当前状态到现代化AI聊天界面的完整升级路径，同时保持Socrates独特的Socratic教学风格和技术优势。

---

## 第一阶段：基础UX现代化（2-3周）

### 目标
提升基础用户体验，解决最明显的可用性问题，为后续功能奠定基础。

### 任务清单

#### 1.1 侧边栏重构（5天）
**当前问题**：4标签侧边栏（知识/最近/错题/代理）增加认知负荷
**解决方案**：合并为单一可搜索列表，项目/标签作为过滤器

**具体步骤**：
1. 创建新的侧边栏组件结构
   ```html
   <div class="sidebar">
     <div class="sidebar-header">...</div>
     <div class="sidebar-filters">
       <!-- 项目过滤器芯片 -->
       <div class="filter-chip active" data-project="all">All</div>
       <div class="filter-chip" data-project="math">Math</div>
       <!-- 更多项目... -->
     </div>
     <div class="sidebar-list">
       <!-- 统一的会话列表 -->
       <div class="session-item">...</div>
     </div>
     <div class="sidebar-footer">...</div>
   </div>
   ```

2. 实现过滤器逻辑
   ```javascript
   // 过滤器状态管理
   const filterState = {
     project: 'all',
     tag: null,
     search: ''
   };

   // 应用过滤器
   function applyFilters() {
     const sessions = getSessions();
     return sessions.filter(session => {
       if (filterState.project !== 'all' && session.project !== filterState.project) {
         return false;
       }
       if (filterState.tag && !session.tags.includes(filterState.tag)) {
         return false;
       }
       if (filterState.search && !session.title.includes(filterState.search)) {
         return false;
       }
       return true;
     });
   }
   ```

3. 添加搜索功能
   ```javascript
   // 侧边栏搜索
   const searchInput = document.querySelector('.sidebar-search');
   searchInput.addEventListener('input', (e) => {
     filterState.search = e.target.value;
     applyFilters();
   });
   ```

**验收标准**：
- [ ] 侧边栏显示为单一可搜索列表
- [ ] 项目和标签作为过滤器芯片正常工作
- [ ] 搜索功能实时过滤会话
- [ ] 保持所有现有功能（置顶、删除、重命名等）

#### 1.2 消息级搜索（2天）
**当前问题**：Cmd-K仅跨会话搜索，无法在活跃对话中搜索
**解决方案**：添加消息内搜索功能

**具体步骤**：
1. 在聊天头部添加搜索按钮
   ```html
   <div class="chat-header">
     <button class="search-in-chat" title="Search in conversation">
       <svg>...</svg>
     </button>
   </div>
   ```

2. 实现搜索面板
   ```javascript
   function searchInChat(query) {
     const messages = document.querySelectorAll('.msg');
     messages.forEach(msg => {
       const text = msg.textContent;
       if (text.toLowerCase().includes(query.toLowerCase())) {
         msg.classList.add('highlight');
         // 滚动到第一个匹配项
         if (!document.querySelector('.msg.highlight:first-of-type')) {
           msg.scrollIntoView({ behavior: 'smooth', block: 'center' });
         }
       } else {
         msg.classList.remove('highlight');
       }
     });
   }
   ```

3. 添加CSS高亮样式
   ```css
   .msg.highlight {
     background: hsl(var(--accent-000) / 0.1);
     border-left: 3px solid hsl(var(--accent-000));
   }
   ```

**验收标准**：
- [ ] 搜索按钮在聊天头部可见
- [ ] 输入搜索词时实时高亮匹配消息
- [ ] 点击上/下导航按钮在匹配项间跳转
- [ ] 清除搜索后高亮消失

#### 1.3 消息入场动画（1天）
**当前问题**：消息出现缺乏视觉反馈
**解决方案**：添加平滑的消息入场动画

**具体步骤**：
1. 添加CSS动画
   ```css
   .msg {
     animation: msgSlideIn 0.3s var(--ease-out);
   }

   @keyframes msgSlideIn {
     from {
       opacity: 0;
       transform: translateY(12px);
     }
     to {
       opacity: 1;
       transform: translateY(0);
     }
   }

   /* 用户消息从右侧滑入 */
   .msg.user {
     animation: msgSlideInRight 0.3s var(--ease-out);
   }

   @keyframes msgSlideInRight {
     from {
       opacity: 0;
       transform: translateX(20px);
     }
     to {
       opacity: 1;
       transform: translateX(0);
     }
   }

   /* 助手消息从左侧滑入 */
   .msg.assistant {
     animation: msgSlideInLeft 0.3s var(--ease-out);
   }

   @keyframes msgSlideInLeft {
     from {
       opacity: 0;
       transform: translateX(-20px);
     }
     to {
       opacity: 1;
       transform: translateX(0);
     }
   }
   ```

2. 为流式消息添加特殊动画
   ```css
   .msg.streaming {
     animation: msgFadeIn 0.5s var(--ease-out);
   }

   @keyframes msgFadeIn {
     from { opacity: 0; }
     to { opacity: 1; }
   }
   ```

**验收标准**：
- [ ] 新消息有平滑的滑入动画
- [ ] 用户消息从右侧滑入
- [ ] 助手消息从左侧滑入
- [ ] 流式消息有淡入效果
- [ ] 动画不会影响性能

#### 1.4 移动端触摸目标优化（2天）
**当前问题**：小触摸目标（22px图钉按钮，12px删除图标）影响移动端体验
**解决方案**：增大触摸目标至最小44px

**具体步骤**：
1. 更新消息工具栏按钮尺寸
   ```css
   .msg-toolbar-btn {
     width: 36px; /* 从24px增加到36px */
     height: 36px; /* 从24px增加到36px */
     display: flex;
     align-items: center;
     justify-content: center;
   }

   /* 移动端进一步增大 */
   @media (hover: none) {
     .msg-toolbar-btn {
       width: 44px;
       height: 44px;
     }
   }
   ```

2. 更新侧边栏操作按钮
   ```css
   .recent-item-del {
     width: 36px; /* 从20px增加到36px */
     height: 36px; /* 从20px增加到36px */
   }

   .recent-item-pin {
     width: 36px; /* 从22px增加到36px */
     height: 36px; /* 从22px增加到36px */
   }
   ```

3. 为移动端添加长按菜单
   ```javascript
   // 移动端长按消息显示操作菜单
   let longPressTimer;
   document.addEventListener('touchstart', (e) => {
     const msg = e.target.closest('.msg');
     if (!msg) return;

     longPressTimer = setTimeout(() => {
       showMobileMessageMenu(msg);
     }, 500);
   });

   document.addEventListener('touchend', () => {
     clearTimeout(longPressTimer);
   });

   function showMobileMessageMenu(msg) {
     // 显示底部操作菜单
     const menu = document.createElement('div');
     menu.className = 'mobile-message-menu';
     menu.innerHTML = `
       <button data-action="copy">Copy</button>
       <button data-action="edit">Edit</button>
       <button data-action="delete">Delete</button>
     `;
     document.body.appendChild(menu);
   }
   ```

**验收标准**：
- [ ] 所有交互元素至少44px触摸目标
- [ ] 移动端长按消息显示操作菜单
- [ ] 桌面端保持现有布局
- [ ] 无障碍访问保持正常

---

## 第二阶段：对话灵活性（3-4周）

### 目标
增强对话管理能力，让用户能够更灵活地探索和编辑对话内容。

### 任务清单

#### 2.1 消息编辑功能增强（5天）
**当前问题**：仅支持编辑最后一条用户消息
**解决方案**：支持编辑任何历史消息并重新生成响应

**具体步骤**：
1. 扩展消息工具栏
   ```javascript
   function buildMessageToolbar(opts) {
     const { role, entry } = opts;
     
     // 为所有消息添加编辑按钮（不仅是用户消息）
     if (role === 'user' || role === 'assistant') {
       addBtn('edit', 'Edit message', editIcon, () => {
         editMessage(entry.clientId);
       });
     }
   }
   ```

2. 实现消息编辑逻辑
   ```javascript
   function editMessage(messageId) {
     const idx = findMessageIndex(messageId);
     if (idx < 0) return;
     
     const entry = state.messages[idx];
     const div = document.querySelector(`[data-client-id="${messageId}"]`);
     const body = div.querySelector('.msg-body');
     
     // 切换到编辑模式
     const textarea = document.createElement('textarea');
     textarea.className = 'msg-edit-area';
     textarea.value = stripMarkdown(entry.rawText || '');
     body.innerHTML = '';
     body.appendChild(textarea);
     textarea.focus();
     
     // 保存编辑
     const commit = () => {
       const newText = textarea.value.trim();
       if (newText && newText !== entry.rawText) {
         entry.rawText = newText;
         entry.html = null;
         
         // 从该点重新生成所有后续响应
         regenerateFromPoint(idx);
       }
       restoreMessageBody(entry, body);
     };
     
     // 键盘快捷键
     textarea.addEventListener('keydown', (e) => {
       if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
         e.preventDefault();
         commit();
       } else if (e.key === 'Escape') {
         restoreMessageBody(entry, body);
       }
     });
   }
   
   function regenerateFromPoint(startIdx) {
     // 删除startIdx之后的所有消息
     const removed = state.messages.splice(startIdx + 1);
     removed.forEach(msg => {
       const div = document.querySelector(`[data-client-id="${msg.clientId}"]`);
       if (div) div.remove();
     });
     
     // 重新生成响应
     const userMessage = state.messages[startIdx];
     if (userMessage.role === 'user') {
       askChatTurn(userMessage.rawText);
     }
   }
   ```

3. 添加视觉反馈
   ```css
   .msg.editing {
     border: 1px solid hsl(var(--accent-000));
     background: hsl(var(--accent-000) / 0.05);
   }
   
   .msg-edit-area {
     width: 100%;
     min-height: 60px;
     background: transparent;
     border: 0.5px solid hsl(var(--border-300) / 0.3);
     border-radius: 6px;
     padding: 6px 8px;
     font: inherit;
     color: inherit;
     resize: vertical;
   }
   ```

**验收标准**：
- [ ] 所有消息都有编辑按钮
- [ ] 点击编辑按钮切换到编辑模式
- [ ] 保存编辑后重新生成后续响应
- [ ] 编辑状态有视觉反馈

#### 2.2 对话分支功能（7天）
**当前问题**：无法从特定点分叉探索替代路径
**解决方案**：实现对话分支功能

**具体步骤**：
1. 添加分支按钮到消息工具栏
   ```javascript
   addBtn('branch', 'Branch from here', branchIcon, () => {
     branchConversation(entry.clientId);
   });
   ```

2. 实现分支逻辑
   ```javascript
   function branchConversation(messageId) {
     const idx = findMessageIndex(messageId);
     if (idx < 0) return;
     
     // 创建分支会话
     const branchSession = {
       id: generateId(),
       title: `${state.topic} (branch)`,
       messages: [...state.messages.slice(0, idx + 1)],
       branchedFrom: state.sessionId,
       branchedAt: messageId
     };
     
     // 保存分支会话
     saveSession(branchSession);
     
     // 切换到分支会话
     loadSession(branchSession.id);
     
     showToast('Conversation branched');
   }
   ```

3. 添加分支指示器
   ```css
   .msg.branched {
     position: relative;
   }
   
   .msg.branched::after {
     content: 'Branched';
     position: absolute;
     top: -8px;
     right: 8px;
     background: hsl(var(--accent-000));
     color: white;
     font-size: 10px;
     padding: 2px 6px;
     border-radius: 999px;
   }
   ```

**验收标准**：
- [ ] 所有消息都有分支按钮
- [ ] 点击分支按钮创建新会话
- [ ] 分支会话显示原始会话链接
- [ ] 分支点有视觉指示器

#### 2.3 文件上传功能（7天）
**当前问题**：无法在对话中上传图像/文档
**解决方案**：实现文件上传和图像处理

**具体步骤**：
1. 添加文件上传按钮到输入栏
   ```html
   <div class="chat-input-footer">
     <button class="upload-btn" title="Upload file">
       <svg>...</svg>
     </button>
     <input type="file" id="fileInput" hidden multiple accept="image/*,.pdf,.doc,.docx">
   </div>
   ```

2. 实现拖放上传
   ```javascript
   const chatInput = document.querySelector('.chat-input-wrap');
   
   chatInput.addEventListener('dragover', (e) => {
     e.preventDefault();
     chatInput.classList.add('drag-over');
   });
   
   chatInput.addEventListener('dragleave', () => {
     chatInput.classList.remove('drag-over');
   });
   
   chatInput.addEventListener('drop', (e) => {
     e.preventDefault();
     chatInput.classList.remove('drag-over');
     handleFiles(e.dataTransfer.files);
   });
   
   function handleFiles(files) {
     Array.from(files).forEach(file => {
       if (file.type.startsWith('image/')) {
         uploadImage(file);
       } else {
         uploadDocument(file);
       }
     });
   }
   ```

3. 实现图像上传和预览
   ```javascript
   async function uploadImage(file) {
     // 创建预览
     const preview = document.createElement('div');
     preview.className = 'file-preview';
     preview.innerHTML = `
       <img src="${URL.createObjectURL(file)}" alt="Preview">
       <button class="remove-preview">×</button>
     `;
     document.querySelector('.chat-input-footer').appendChild(preview);
     
     // 上传到服务器
     const formData = new FormData();
     formData.append('file', file);
     
     try {
       const response = await apiFetch('/api/files/upload', {
         method: 'POST',
         body: formData
       });
       
       // 添加到消息输入
       const input = document.getElementById('chatInputArea');
       input.value += `\n[Image: ${response.url}]`;
     } catch (error) {
       showToast('Upload failed');
     }
   }
   ```

4. 添加CSS样式
   ```css
   .file-preview {
     position: absolute;
     bottom: 100%;
     left: 0;
     right: 0;
     display: flex;
     gap: 8px;
     padding: 8px;
     background: hsl(var(--bg-000));
     border: 0.5px solid hsl(var(--border-300) / 0.12);
     border-radius: 8px;
     margin-bottom: 8px;
   }
   
   .file-preview img {
     width: 80px;
     height: 80px;
     object-fit: cover;
     border-radius: 4px;
   }
   
   .remove-preview {
     position: absolute;
     top: 4px;
     right: 4px;
     width: 20px;
     height: 20px;
     border-radius: 50%;
     background: hsl(0 60% 50%);
     color: white;
     border: none;
     cursor: pointer;
   }
   
   .chat-input-wrap.drag-over {
     border-color: hsl(var(--accent-000));
     box-shadow: 0 0 0 2px hsl(var(--accent-000) / 0.2);
   }
   ```

**验收标准**：
- [ ] 上传按钮在输入栏可见
- [ ] 支持拖放上传
- [ ] 图像上传显示预览
- [ ] 上传完成后预览消失
- [ ] 支持多种文件格式

#### 2.4 语音输入功能（5天）
**当前问题**：无语音转文本功能
**解决方案**：添加麦克风按钮实现语音输入

**具体步骤**：
1. 添加麦克风按钮
   ```html
   <button class="mic-btn" title="Voice input">
     <svg>...</svg>
   </button>
   ```

2. 实现语音识别
   ```javascript
   let recognition;
   
   function initVoiceRecognition() {
     if ('webkitSpeechRecognition' in window) {
       recognition = new webkitSpeechRecognition();
       recognition.continuous = false;
       recognition.interimResults = true;
       recognition.lang = 'en-US';
       
       recognition.onresult = (event) => {
         const transcript = Array.from(event.results)
           .map(result => result[0].transcript)
           .join('');
         
         const input = document.getElementById('chatInputArea');
         input.value = transcript;
       };
       
       recognition.onend = () => {
         document.querySelector('.mic-btn').classList.remove('recording');
       };
     }
   }
   
   function toggleVoiceInput() {
     const micBtn = document.querySelector('.mic-btn');
     
     if (micBtn.classList.contains('recording')) {
       recognition.stop();
       micBtn.classList.remove('recording');
     } else {
       recognition.start();
       micBtn.classList.add('recording');
     }
   }
   ```

3. 添加CSS样式
   ```css
   .mic-btn {
     width: 32px;
     height: 32px;
     border-radius: 50%;
     background: hsl(var(--bg-300));
     color: hsl(var(--text-400));
     border: none;
     cursor: pointer;
     transition: all 0.1s;
   }
   
   .mic-btn:hover {
     background: hsl(var(--bg-400));
     color: hsl(var(--text-200));
   }
   
   .mic-btn.recording {
     background: hsl(0 70% 50%);
     color: white;
     animation: pulse 1.5s infinite;
   }
   
   @keyframes pulse {
     0%, 100% { box-shadow: 0 0 0 0 hsl(0 70% 50% / 0.4); }
     50% { box-shadow: 0 0 0 8px hsl(0 70% 50% / 0); }
   }
   ```

**验收标准**：
- [ ] 麦克风按钮在输入栏可见
- [ ] 点击开始录音，按钮变红并脉动
- [ ] 语音识别结果实时显示在输入框
- [ ] 录音结束后按钮恢复原状
- [ ] 支持多种语言

#### 2.5 消息内搜索（3天）
**当前问题**：无法在活跃对话中搜索特定内容
**解决方案**：实现聊天内搜索功能

**具体步骤**：
1. 添加搜索按钮到聊天头部
   ```javascript
   const searchBtn = document.createElement('button');
   searchBtn.className = 'chat-search-btn';
   searchBtn.innerHTML = '<svg>...</svg>';
   searchBtn.onclick = toggleChatSearch;
   document.querySelector('.chat-header').appendChild(searchBtn);
   ```

2. 实现搜索面板
   ```javascript
   function toggleChatSearch() {
     let searchPanel = document.querySelector('.chat-search-panel');
     
     if (searchPanel) {
       searchPanel.remove();
       return;
     }
     
     searchPanel = document.createElement('div');
     searchPanel.className = 'chat-search-panel';
     searchPanel.innerHTML = `
       <input type="text" placeholder="Search in conversation...">
       <div class="search-nav">
         <span class="search-count">0 results</span>
         <button class="search-prev">↑</button>
         <button class="search-next">↓</button>
         <button class="search-close">×</button>
       </div>
     `;
     
     document.querySelector('.chat-view').insertBefore(searchPanel, document.querySelector('.msg-list'));
     
     // 绑定事件
     const input = searchPanel.querySelector('input');
     input.addEventListener('input', (e) => searchInChat(e.target.value));
     
     searchPanel.querySelector('.search-prev').onclick = () => navigateSearch('prev');
     searchPanel.querySelector('.search-next').onclick = () => navigateSearch('next');
     searchPanel.querySelector('.search-close').onclick = () => searchPanel.remove();
   }
   
   let currentSearchIndex = 0;
   let searchMatches = [];
   
   function searchInChat(query) {
     searchMatches = [];
     currentSearchIndex = 0;
     
     const messages = document.querySelectorAll('.msg');
     messages.forEach((msg, idx) => {
       const text = msg.textContent;
       if (text.toLowerCase().includes(query.toLowerCase())) {
         searchMatches.push({ element: msg, index: idx });
         msg.classList.add('search-match');
       } else {
         msg.classList.remove('search-match');
       }
     });
     
     // 更新计数
     const count = document.querySelector('.search-count');
     count.textContent = `${searchMatches.length} results`;
     
     // 高亮第一个匹配项
     if (searchMatches.length > 0) {
       highlightMatch(0);
     }
   }
   
   function highlightMatch(index) {
     searchMatches.forEach((match, i) => {
       match.element.classList.toggle('search-active', i === index);
     });
     
     searchMatches[index].element.scrollIntoView({
       behavior: 'smooth',
       block: 'center'
     });
   }
   
   function navigateSearch(direction) {
     if (searchMatches.length === 0) return;
     
     if (direction === 'next') {
       currentSearchIndex = (currentSearchIndex + 1) % searchMatches.length;
     } else {
       currentSearchIndex = (currentSearchIndex - 1 + searchMatches.length) % searchMatches.length;
     }
     
     highlightMatch(currentSearchIndex);
   }
   ```

3. 添加CSS样式
   ```css
   .chat-search-panel {
     display: flex;
     align-items: center;
     gap: 8px;
     padding: 8px 12px;
     background: hsl(var(--bg-100));
     border-bottom: 0.5px solid hsl(var(--border-300) / 0.12);
   }
   
   .chat-search-panel input {
     flex: 1;
     padding: 6px 10px;
     border: 0.5px solid hsl(var(--border-300) / 0.3);
     border-radius: 6px;
     background: hsl(var(--bg-000));
     color: hsl(var(--text-100));
     font: inherit;
   }
   
   .search-nav {
     display: flex;
     align-items: center;
     gap: 4px;
   }
   
   .search-count {
     font-size: 12px;
     color: hsl(var(--text-500));
     margin-right: 8px;
   }
   
   .search-match {
     background: hsl(var(--accent-000) / 0.1);
     border-left: 3px solid hsl(var(--accent-000));
   }
   
   .search-active {
     background: hsl(var(--accent-000) / 0.2);
     border-left: 3px solid hsl(var(--accent-000));
   }
   ```

**验收标准**：
- [ ] 搜索按钮在聊天头部可见
- [ ] 点击打开搜索面板
- [ ] 输入时实时高亮匹配消息
- [ ] 上/下导航按钮在匹配项间跳转
- [ ] 显示匹配数量
- [ ] 关闭搜索后高亮消失

---

## 第三阶段：视觉身份提升（2-3周）

### 目标
提升视觉吸引力，创建更独特的品牌识别度，同时保持现有的设计语言。

### 任务清单

#### 3.1 知识图谱可视化（7天）
**当前问题**：固定的5节点线性列表缺乏视觉吸引力
**解决方案**：动态可视化知识网络

**具体步骤**：
1. 创建SVG画布
   ```html
   <div class="knowledge-graph">
     <svg id="knowledgeSvg" width="100%" height="100%">
       <!-- 节点和连接线将通过JS动态生成 -->
     </svg>
   </div>
   ```

2. 实现力导向图布局
   ```javascript
   class KnowledgeGraph {
     constructor(svgElement, nodes) {
       this.svg = svgElement;
       this.nodes = nodes;
       this.edges = this.calculateEdges();
       this.simulation = d3.forceSimulation(this.nodes)
         .force('link', d3.forceLink(this.edges).distance(100))
         .force('charge', d3.forceManyBody().strength(-300))
         .force('center', d3.forceCenter(150, 150));
     }
     
     calculateEdges() {
       // 根据知识依赖关系创建边
       const edges = [];
       for (let i = 0; i < this.nodes.length; i++) {
         for (let j = i + 1; j < this.nodes.length; j++) {
           if (this.hasDependency(this.nodes[i], this.nodes[j])) {
             edges.push({ source: this.nodes[i], target: this.nodes[j] });
           }
         }
       }
       return edges;
     }
     
     render() {
       // 渲染节点
       const circles = this.svg.selectAll('circle')
         .data(this.nodes)
         .enter()
         .append('circle')
         .attr('r', d => this.getNodeRadius(d))
         .attr('fill', d => this.getNodeColor(d))
         .call(d3.drag()
           .on('start', this.dragStarted.bind(this))
           .on('drag', this.dragged.bind(this))
           .on('end', this.dragEnded.bind(this)));
       
       // 渲染边
       const lines = this.svg.selectAll('line')
         .data(this.edges)
         .enter()
         .append('line')
         .attr('stroke', '#999')
         .attr('stroke-opacity', 0.6);
       
       // 更新布局
       this.simulation.on('tick', () => {
         circles
           .attr('cx', d => d.x)
           .attr('cy', d => d.y);
         
         lines
           .attr('x1', d => d.source.x)
           .attr('y1', d => d.source.y)
           .attr('x2', d => d.target.x)
           .attr('y2', d => d.target.y);
       });
     }
     
     getNodeRadius(d) {
       return 20 + (d.questions * 5);
     }
     
     getNodeColor(d) {
       const colors = {
         blank: '#888',
         fuzzy: 'hsl(43 77% 62%)',
         internalized: 'hsl(145 50% 50%)'
       };
       return colors[d.status];
     }
   }
   ```

3. 添加交互功能
   ```javascript
   // 点击节点显示详情
   circles.on('click', (event, d) => {
     this.showNodeDetails(d);
   });
   
   // 悬停显示工具提示
   circles.on('mouseover', (event, d) => {
     this.showTooltip(event, d);
   });
   
   showNodeDetails(node) {
     // 显示节点详情面板
     const panel = document.createElement('div');
     panel.className = 'node-details';
     panel.innerHTML = `
       <h3>${node.name}</h3>
       <p>Status: ${node.status}</p>
       <p>Questions: ${node.questions}</p>
       <p>History: ${node.history.length}</p>
     `;
     document.body.appendChild(panel);
   }
   ```

4. 添加CSS样式
   ```css
   .knowledge-graph {
     width: 100%;
     height: 300px;
     border: 0.5px solid hsl(var(--border-300) / 0.12);
     border-radius: 8px;
     background: hsl(var(--bg-100));
     overflow: hidden;
   }
   
   .node-details {
     position: fixed;
     top: 50%;
     left: 50%;
     transform: translate(-50%, -50%);
     background: hsl(var(--bg-000));
     border: 0.5px solid hsl(var(--border-300) / 0.3);
     border-radius: 12px;
     padding: 20px;
     box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
     z-index: 1000;
   }
   ```

**验收标准**：
- [ ] 知识图谱显示为动态网络
- [ ] 节点颜色表示状态（灰色、金色、绿色）
- [ ] 节点大小基于问题数量
- [ ] 可拖拽节点重新排列
- [ ] 点击节点显示详情
- [ ] 悬停显示工具提示

#### 3.2 代理模式分屏视图（7天）
**当前问题**：代理模式替换整个聊天UI
**解决方案**：实现分屏视图，左侧聊天，右侧工具面板

**具体步骤**：
1. 重构代理模式布局
   ```html
   <div class="agent-view">
     <div class="agent-chat">
       <!-- 聊天消息流 -->
       <div class="msg-list">...</div>
       <div class="chat-input-bar">...</div>
     </div>
     <div class="agent-tools">
       <!-- 工具面板 -->
       <div class="tool-tabs">
         <button class="tool-tab active" data-tab="files">Files</button>
         <button class="tool-tab" data-tab="shell">Shell</button>
         <button class="tool-tab" data-tab="web">Web</button>
       </div>
       <div class="tool-content">
         <!-- 工具内容 -->
       </div>
     </div>
   </div>
   ```

2. 实现工具面板
   ```javascript
   class AgentToolPanel {
     constructor() {
       this.activeTab = 'files';
       this.files = [];
       this.shellHistory = [];
     }
     
     render() {
       const panel = document.querySelector('.agent-tools');
       panel.innerHTML = `
         <div class="tool-tabs">
           <button class="tool-tab ${this.activeTab === 'files' ? 'active' : ''}" 
                   data-tab="files">Files</button>
           <button class="tool-tab ${this.activeTab === 'shell' ? 'active' : ''}" 
                   data-tab="shell">Shell</button>
           <button class="tool-tab ${this.activeTab === 'web' ? 'active' : ''}" 
                   data-tab="web">Web</button>
         </div>
         <div class="tool-content">
           ${this.renderTabContent()}
         </div>
       `;
       
       // 绑定标签切换
       panel.querySelectorAll('.tool-tab').forEach(tab => {
         tab.onclick = () => {
           this.activeTab = tab.dataset.tab;
           this.render();
         };
       });
     }
     
     renderTabContent() {
       switch (this.activeTab) {
         case 'files':
           return this.renderFileExplorer();
         case 'shell':
           return this.renderShell();
         case 'web':
           return this.renderWebPreview();
       }
     }
     
     renderFileExplorer() {
       return `
         <div class="file-explorer">
           <div class="file-toolbar">
             <button class="new-file-btn">New File</button>
             <button class="new-folder-btn">New Folder</button>
           </div>
           <div class="file-tree">
             ${this.renderFileTree(this.files)}
           </div>
         </div>
       `;
     }
     
     renderFileTree(files, indent = 0) {
       return files.map(file => `
         <div class="file-item" style="padding-left: ${indent * 20}px">
           <span class="file-icon">${file.type === 'folder' ? '📁' : '📄'}</span>
           <span class="file-name">${file.name}</span>
         </div>
         ${file.children ? this.renderFileTree(file.children, indent + 1) : ''}
       `).join('');
     }
     
     renderShell() {
       return `
         <div class="shell-panel">
           <div class="shell-output">
             ${this.shellHistory.map(cmd => `
               <div class="shell-command">
                 <span class="prompt">$</span>
                 <span class="command">${cmd.command}</span>
                 <pre class="output">${cmd.output}</pre>
               </div>
             `).join('')}
           </div>
           <div class="shell-input">
             <span class="prompt">$</span>
             <input type="text" placeholder="Enter command...">
           </div>
         </div>
       `;
     }
     
     renderWebPreview() {
       return `
         <div class="web-preview">
           <div class="web-toolbar">
             <input type="text" placeholder="Enter URL...">
             <button class="go-btn">Go</button>
           </div>
           <iframe class="web-frame" src="about:blank"></iframe>
         </div>
       `;
     }
   }
   ```

3. 添加CSS样式
   ```css
   .agent-view {
     display: flex;
     height: 100%;
   }
   
   .agent-chat {
     flex: 1;
     display: flex;
     flex-direction: column;
     min-width: 0;
   }
   
   .agent-tools {
     width: 350px;
     border-left: 0.5px solid hsl(var(--border-300) / 0.12);
     background: hsl(var(--bg-100));
     display: flex;
     flex-direction: column;
   }
   
   .tool-tabs {
     display: flex;
     border-bottom: 0.5px solid hsl(var(--border-300) / 0.12);
   }
   
   .tool-tab {
     flex: 1;
     padding: 8px;
     background: transparent;
     border: none;
     color: hsl(var(--text-400));
     cursor: pointer;
     transition: all 0.1s;
   }
   
   .tool-tab:hover {
     color: hsl(var(--text-200));
     background: hsl(var(--bg-200));
   }
   
   .tool-tab.active {
     color: hsl(var(--accent-000));
     border-bottom: 2px solid hsl(var(--accent-000));
   }
   
   .tool-content {
     flex: 1;
     overflow-y: auto;
     padding: 12px;
   }
   
   .file-explorer {
     display: flex;
     flex-direction: column;
     height: 100%;
   }
   
   .file-toolbar {
     display: flex;
     gap: 8px;
     margin-bottom: 12px;
   }
   
   .file-tree {
     flex: 1;
     overflow-y: auto;
   }
   
   .file-item {
     display: flex;
     align-items: center;
     gap: 8px;
     padding: 4px 8px;
     border-radius: 4px;
     cursor: pointer;
     transition: background 0.1s;
   }
   
   .file-item:hover {
     background: hsl(var(--bg-200));
   }
   
   .shell-panel {
     display: flex;
     flex-direction: column;
     height: 100%;
   }
   
   .shell-output {
     flex: 1;
     overflow-y: auto;
     font-family: var(--font-mono);
     font-size: 13px;
   }
   
   .shell-command {
     margin-bottom: 8px;
   }
   
   .prompt {
     color: hsl(var(--accent-000));
   }
   
   .command {
     color: hsl(var(--text-100));
   }
   
   .output {
     color: hsl(var(--text-300));
     margin: 4px 0 0 16px;
   }
   
   .shell-input {
     display: flex;
     align-items: center;
     gap: 8px;
     padding: 8px;
     border-top: 0.5px solid hsl(var(--border-300) / 0.12);
   }
   
   .shell-input input {
     flex: 1;
     background: transparent;
     border: none;
     color: hsl(var(--text-100));
     font-family: var(--font-mono);
     font-size: 13px;
   }
   
   .web-preview {
     display: flex;
     flex-direction: column;
     height: 100%;
   }
   
   .web-toolbar {
     display: flex;
     gap: 8px;
     margin-bottom: 12px;
   }
   
   .web-toolbar input {
     flex: 1;
     padding: 6px 10px;
     border: 0.5px solid hsl(var(--border-300) / 0.3);
     border-radius: 6px;
     background: hsl(var(--bg-000));
     color: hsl(var(--text-100));
   }
   
   .web-frame {
     flex: 1;
     border: 0.5px solid hsl(var(--border-300) / 0.12);
     border-radius: 8px;
   }
   ```

**验收标准**：
- [ ] 代理模式显示分屏视图
- [ ] 左侧显示聊天消息流
- [ ] 右侧显示工具面板
- [ ] 工具面板有文件、Shell、Web标签
- [ ] 标签切换正常工作
- [ ] 文件浏览器显示文件树
- [ ] Shell面板显示命令历史
- [ ] Web预览显示iframe

#### 3.3 更丰富的微交互动画（3天）
**当前问题**：最小动画缺乏视觉反馈
**解决方案**：添加更丰富的微交互动画

**具体步骤**：
1. 添加按钮悬停动画
   ```css
   .icon-btn {
     transition: all 0.2s var(--ease-out);
   }
   
   .icon-btn:hover {
     transform: scale(1.1);
     background: hsl(var(--bg-300));
   }
   
   .icon-btn:active {
     transform: scale(0.95);
   }
   ```

2. 添加切换动画
   ```css
   .stg-toggle-track {
     transition: background 0.3s var(--ease-out), 
                 border-color 0.3s var(--ease-out);
   }
   
   .stg-toggle-knob {
     transition: left 0.3s var(--ease-spring);
   }
   ```

3. 添加模态框动画
   ```css
   .settings-modal {
     animation: modalSlideUp 0.3s var(--ease-out);
   }
   
   @keyframes modalSlideUp {
     from {
       opacity: 0;
       transform: translateY(20px) scale(0.95);
     }
     to {
       opacity: 1;
       transform: translateY(0) scale(1);
     }
   }
   
   .settings-overlay {
     animation: fadeIn 0.2s ease-out;
   }
   
   @keyframes fadeIn {
     from { opacity: 0; }
     to { opacity: 1; }
   }
   ```

4. 添加加载状态动画
   ```css
   .loading span {
     animation: loadBounce 1.4s infinite;
   }
   
   .loading span:nth-child(2) {
     animation-delay: 0.2s;
   }
   
   .loading span:nth-child(3) {
     animation-delay: 0.4s;
   }
   
   @keyframes loadBounce {
     0%, 80%, 100% {
       opacity: 0.3;
       transform: scale(0.8);
     }
     40% {
       opacity: 1;
       transform: scale(1);
     }
   }
   ```

**验收标准**：
- [ ] 按钮悬停有缩放效果
- [ ] 按钮点击有按压效果
- [ ] 切换开关有平滑过渡
- [ ] 模态框有滑入动画
- [ ] 加载状态有弹跳动画

#### 3.4 移动手势交互（3天）
**当前问题**：无移动端手势支持
**解决方案**：添加滑动删除、下拉刷新等手势

**具体步骤**：
1. 实现滑动删除
   ```javascript
   let startX, currentX, isDragging = false;
   
   document.addEventListener('touchstart', (e) => {
     const msg = e.target.closest('.msg');
     if (!msg) return;
     
     startX = e.touches[0].clientX;
     isDragging = true;
   });
   
   document.addEventListener('touchmove', (e) => {
     if (!isDragging) return;
     
     const msg = e.target.closest('.msg');
     if (!msg) return;
     
     currentX = e.touches[0].clientX;
     const diff = startX - currentX;
     
     if (diff > 0) {
       msg.style.transform = `translateX(-${diff}px)`;
       msg.style.opacity = 1 - (diff / 200);
     }
   });
   
   document.addEventListener('touchend', (e) => {
     if (!isDragging) return;
     
     const msg = e.target.closest('.msg');
     if (!msg) return;
     
     const diff = startX - currentX;
     
     if (diff > 100) {
       // 删除消息
       msg.style.transform = 'translateX(-100%)';
       msg.style.opacity = '0';
       setTimeout(() => {
         msg.remove();
         // 调用删除API
       }, 300);
     } else {
       // 恢复原位
       msg.style.transform = 'translateX(0)';
       msg.style.opacity = '1';
     }
     
     isDragging = false;
   });
   ```

2. 实现下拉刷新
   ```javascript
   let pullStartY = 0;
   let isPulling = false;
   
   const msgList = document.querySelector('.msg-list');
   
   msgList.addEventListener('touchstart', (e) => {
     if (msgList.scrollTop === 0) {
       pullStartY = e.touches[0].clientY;
       isPulling = true;
     }
   });
   
   msgList.addEventListener('touchmove', (e) => {
     if (!isPulling) return;
     
     const currentY = e.touches[0].clientY;
     const diff = currentY - pullStartY;
     
     if (diff > 0 && msgList.scrollTop === 0) {
       const pullIndicator = document.querySelector('.pull-indicator') || createPullIndicator();
       pullIndicator.style.transform = `translateY(${diff}px)`;
       pullIndicator.textContent = diff > 100 ? 'Release to refresh' : 'Pull to refresh';
     }
   });
   
   msgList.addEventListener('touchend', () => {
     if (!isPulling) return;
     
     const pullIndicator = document.querySelector('.pull-indicator');
     if (pullIndicator) {
       const diff = parseInt(pullIndicator.style.transform.replace(/[^0-9]/g, '')) || 0;
       
       if (diff > 100) {
         // 刷新消息
         refreshMessages();
       }
       
       pullIndicator.remove();
     }
     
     isPulling = false;
   });
   
   function createPullIndicator() {
     const indicator = document.createElement('div');
     indicator.className = 'pull-indicator';
     indicator.textContent = 'Pull to refresh';
     msgList.insertBefore(indicator, msgList.firstChild);
     return indicator;
   }
   ```

3. 添加CSS样式
   ```css
   .msg {
     transition: transform 0.3s var(--ease-out), 
                 opacity 0.3s var(--ease-out);
     touch-action: pan-y;
   }
   
   .pull-indicator {
     text-align: center;
     padding: 12px;
     color: hsl(var(--text-500));
     font-size: 13px;
     transform: translateY(-50px);
     transition: transform 0.3s var(--ease-out);
   }
   ```

**验收标准**：
- [ ] 滑动消息显示删除确认
- [ ] 滑动超过阈值删除消息
- [ ] 下拉刷新显示提示文字
- [ ] 释放后刷新消息列表
- [ ] 动画平滑自然

---

## 第四阶段：高级功能（4-6周）

### 目标
实现更高级的编辑和可视化功能，提升用户体验。

### 任务清单

#### 4.1 Markdown WYSIWYG编辑器（10天）
**当前问题**：编辑时显示原始Markdown
**解决方案**：实现实时预览的Markdown编辑器

**具体步骤**：
1. 创建双面板编辑器
   ```html
   <div class="markdown-editor">
     <div class="editor-toolbar">
       <button class="bold-btn" title="Bold">B</button>
       <button class="italic-btn" title="Italic">I</button>
       <button class="code-btn" title="Code">&lt;/&gt;</button>
       <button class="link-btn" title="Link">🔗</button>
     </div>
     <div class="editor-panels">
       <div class="editor-input">
         <textarea placeholder="Write markdown..."></textarea>
       </div>
       <div class="editor-preview">
         <!-- 实时预览 -->
       </div>
     </div>
   </div>
   ```

2. 实现实时预览
   ```javascript
   class MarkdownEditor {
     constructor(textarea, preview) {
       this.textarea = textarea;
       this.preview = preview;
       this.debounceTimer = null;
       
       this.textarea.addEventListener('input', () => {
         this.debouncePreview();
       });
     }
     
     debouncePreview() {
       clearTimeout(this.debounceTimer);
       this.debounceTimer = setTimeout(() => {
         this.updatePreview();
       }, 150);
     }
     
     updatePreview() {
       const markdown = this.textarea.value;
       this.preview.innerHTML = this.renderMarkdown(markdown);
     }
     
     renderMarkdown(text) {
       // 使用现有的formatMsg函数
       return formatMsg(text);
     }
     
     insertMarkdown(syntax) {
       const start = this.textarea.selectionStart;
       const end = this.textarea.selectionEnd;
       const selectedText = this.textarea.value.substring(start, end);
       
       let newText;
       if (syntax === 'bold') {
         newText = `**${selectedText}**`;
       } else if (syntax === 'italic') {
         newText = `*${selectedText}*`;
       } else if (syntax === 'code') {
         newText = `\`${selectedText}\``;
       } else if (syntax === 'link') {
         newText = `[${selectedText}](url)`;
       }
       
       this.textarea.value = this.textarea.value.substring(0, start) + 
                            newText + 
                            this.textarea.value.substring(end);
       
       this.updatePreview();
     }
   }
   ```

3. 添加CSS样式
   ```css
   .markdown-editor {
     border: 0.5px solid hsl(var(--border-300) / 0.3);
     border-radius: 8px;
     overflow: hidden;
   }
   
   .editor-toolbar {
     display: flex;
     gap: 4px;
     padding: 8px;
     background: hsl(var(--bg-200));
     border-bottom: 0.5px solid hsl(var(--border-300) / 0.12);
   }
   
   .editor-toolbar button {
     width: 32px;
     height: 32px;
     border-radius: 6px;
     background: transparent;
     border: none;
     color: hsl(var(--text-400));
     cursor: pointer;
     transition: all 0.1s;
   }
   
   .editor-toolbar button:hover {
     background: hsl(var(--bg-300));
     color: hsl(var(--text-100));
   }
   
   .editor-panels {
     display: grid;
     grid-template-columns: 1fr 1fr;
     height: 300px;
   }
   
   .editor-input textarea {
     width: 100%;
     height: 100%;
     border: none;
     padding: 12px;
     font-family: var(--font-mono);
     font-size: 14px;
     resize: none;
     background: hsl(var(--bg-000));
     color: hsl(var(--text-100));
   }
   
   .editor-preview {
     padding: 12px;
     border-left: 0.5px solid hsl(var(--border-300) / 0.12);
     overflow-y: auto;
     background: hsl(var(--bg-100));
   }
   ```

**验收标准**：
- [ ] 编辑器显示工具栏
- [ ] 输入Markdown时实时预览
- [ ] 工具栏按钮插入相应语法
- [ ] 预览显示格式化后的内容
- [ ] 支持所有Markdown语法

#### 4.2 推理时间线（7天）
**当前问题**：思考药丸作为小展开文本
**解决方案**：显示结构化的逐步推理时间线

**具体步骤**：
1. 创建时间线组件
   ```html
   <div class="reasoning-timeline">
     <div class="timeline-step completed">
       <div class="step-indicator">✓</div>
       <div class="step-content">
         <div class="step-title">分析问题</div>
         <div class="step-text">识别关键概念和约束条件</div>
       </div>
     </div>
     <div class="timeline-step active">
       <div class="step-indicator">2</div>
       <div class="step-content">
         <div class="step-title">生成假设</div>
         <div class="step-text">基于已知信息形成初步假设</div>
       </div>
     </div>
     <div class="timeline-step pending">
       <div class="step-indicator">3</div>
       <div class="step-content">
         <div class="step-title">验证假设</div>
         <div class="step-text">测试假设的有效性</div>
       </div>
     </div>
   </div>
   ```

2. 实现时间线逻辑
   ```javascript
   class ReasoningTimeline {
     constructor() {
       this.steps = [];
       this.currentStep = 0;
     }
     
     addStep(title, text) {
       this.steps.push({ title, text, status: 'pending' });
       this.render();
     }
     
     updateStep(index, text) {
       if (this.steps[index]) {
         this.steps[index].text = text;
         this.render();
       }
     }
     
     completeStep(index) {
       if (this.steps[index]) {
         this.steps[index].status = 'completed';
         this.currentStep = index + 1;
         if (this.steps[this.currentStep]) {
           this.steps[this.currentStep].status = 'active';
         }
         this.render();
       }
     }
     
     render() {
       const container = document.querySelector('.reasoning-timeline');
       if (!container) return;
       
       container.innerHTML = this.steps.map((step, index) => `
         <div class="timeline-step ${step.status}">
           <div class="step-indicator">
             ${step.status === 'completed' ? '✓' : index + 1}
           </div>
           <div class="step-content">
             <div class="step-title">${step.title}</div>
             <div class="step-text">${step.text}</div>
           </div>
         </div>
       `).join('');
     }
   }
   ```

3. 添加CSS样式
   ```css
   .reasoning-timeline {
     display: flex;
     flex-direction: column;
     gap: 12px;
     padding: 16px;
     background: hsl(var(--bg-100));
     border: 0.5px solid hsl(var(--border-300) / 0.12);
     border-radius: 8px;
   }
   
   .timeline-step {
     display: flex;
     gap: 12px;
     opacity: 0.5;
     transition: opacity 0.3s;
   }
   
   .timeline-step.active,
   .timeline-step.completed {
     opacity: 1;
   }
   
   .step-indicator {
     width: 24px;
     height: 24px;
     border-radius: 50%;
     display: flex;
     align-items: center;
     justify-content: center;
     font-size: 12px;
     font-weight: 600;
     background: hsl(var(--bg-300));
     color: hsl(var(--text-400));
     flex-shrink: 0;
   }
   
   .timeline-step.completed .step-indicator {
     background: hsl(145 50% 50%);
     color: white;
   }
   
   .timeline-step.active .step-indicator {
     background: hsl(var(--accent-000));
     color: white;
     animation: pulse 1.5s infinite;
   }
   
   @keyframes pulse {
     0%, 100% { box-shadow: 0 0 0 0 hsl(var(--accent-000) / 0.4); }
     50% { box-shadow: 0 0 0 8px hsl(var(--accent-000) / 0); }
   }
   
   .step-content {
     flex: 1;
   }
   
   .step-title {
     font-weight: 500;
     color: hsl(var(--text-100));
     margin-bottom: 4px;
   }
   
   .step-text {
     font-size: 13px;
     color: hsl(var(--text-400));
   }
   ```

**验收标准**：
- [ ] 时间线显示为垂直步骤列表
- [ ] 完成的步骤显示绿色对勾
- [ ] 当前步骤显示脉动动画
- [ ] 待处理步骤显示为灰色
- [ ] 步骤标题和文本清晰显示

#### 4.3 代码沙箱集成（7天）
**当前问题**：无法在对话中执行Python代码
**解决方案**：集成代码沙箱实现Python执行

**具体步骤**：
1. 创建沙箱组件
   ```html
   <div class="code-sandbox">
     <div class="sandbox-header">
       <div class="language-selector">
         <button class="lang-btn active" data-lang="python">Python</button>
         <button class="lang-btn" data-lang="javascript">JavaScript</button>
       </div>
       <button class="run-btn">Run</button>
     </div>
     <div class="sandbox-body">
       <div class="code-editor">
         <textarea placeholder="Write code..."></textarea>
       </div>
       <div class="output-panel">
         <pre class="output"></pre>
       </div>
     </div>
   </div>
   ```

2. 实现沙箱逻辑
   ```javascript
   class CodeSandbox {
     constructor() {
       this.language = 'python';
       this.code = '';
       this.output = '';
     }
     
     setLanguage(lang) {
       this.language = lang;
       this.render();
     }
     
     async run() {
       const code = document.querySelector('.code-editor textarea').value;
       
       try {
         const response = await apiFetch('/api/sandbox/run', {
           method: 'POST',
           body: {
             language: this.language,
             code: code
           }
         });
         
         this.output = response.output;
         this.render();
       } catch (error) {
         this.output = `Error: ${error.message}`;
         this.render();
       }
     }
     
     render() {
       const output = document.querySelector('.output');
       output.textContent = this.output;
     }
   }
   ```

3. 添加CSS样式
   ```css
   .code-sandbox {
     border: 0.5px solid hsl(var(--border-300) / 0.3);
     border-radius: 8px;
     overflow: hidden;
   }
   
   .sandbox-header {
     display: flex;
     justify-content: space-between;
     align-items: center;
     padding: 8px 12px;
     background: hsl(var(--bg-200));
     border-bottom: 0.5px solid hsl(var(--border-300) / 0.12);
   }
   
   .language-selector {
     display: flex;
     gap: 4px;
   }
   
   .lang-btn {
     padding: 4px 8px;
     border-radius: 4px;
     background: transparent;
     border: none;
     color: hsl(var(--text-400));
     cursor: pointer;
     transition: all 0.1s;
   }
   
   .lang-btn:hover {
     background: hsl(var(--bg-300));
     color: hsl(var(--text-100));
   }
   
   .lang-btn.active {
     background: hsl(var(--accent-000) / 0.1);
     color: hsl(var(--accent-000));
   }
   
   .run-btn {
     padding: 6px 12px;
     border-radius: 6px;
     background: hsl(var(--accent-000));
     color: white;
     border: none;
     cursor: pointer;
     font-weight: 500;
     transition: background 0.1s;
   }
   
   .run-btn:hover {
     background: hsl(var(--accent-100));
   }
   
   .sandbox-body {
     display: grid;
     grid-template-columns: 1fr 1fr;
     height: 300px;
   }
   
   .code-editor textarea {
     width: 100%;
     height: 100%;
     border: none;
     padding: 12px;
     font-family: var(--font-mono);
     font-size: 14px;
     resize: none;
     background: hsl(var(--bg-000));
     color: hsl(var(--text-100));
   }
   
   .output-panel {
     border-left: 0.5px solid hsl(var(--border-300) / 0.12);
     background: hsl(var(--bg-100));
   }
   
   .output {
     padding: 12px;
     font-family: var(--font-mono);
     font-size: 14px;
     color: hsl(var(--text-200));
     white-space: pre-wrap;
   }
   ```

**验收标准**：
- [ ] 沙箱显示语言选择器
- [ ] 可以切换Python和JavaScript
- [ ] 运行按钮执行代码
- [ ] 输出显示在右侧面板
- [ ] 支持错误信息显示

#### 4.4 工作区协作（7天）
**当前问题**：工作区协作为单用户
**解决方案**：实现实时协作编辑功能

**具体步骤**：
1. 创建协作组件
   ```html
   <div class="collaboration-panel">
     <div class="collab-header">
       <h3>Collaborators</h3>
       <button class="invite-btn">Invite</button>
     </div>
     <div class="collab-list">
       <div class="collab-user">
         <div class="avatar">J</div>
         <div class="user-info">
           <div class="user-name">John Doe</div>
           <div class="user-status">Editing</div>
         </div>
         <div class="cursor-indicator" style="left: 120px; top: 45px;"></div>
       </div>
     </div>
   </div>
   ```

2. 实现实时协作
   ```javascript
   class CollaborationManager {
     constructor() {
       this.collaborators = [];
       this.socket = null;
       this.document = '';
     }
     
     connect(sessionId) {
       this.socket = new WebSocket(`wss://api.example.com/collab/${sessionId}`);
       
       this.socket.onmessage = (event) => {
         const data = JSON.parse(event.data);
         this.handleMessage(data);
       };
     }
     
     handleMessage(data) {
       switch (data.type) {
         case 'user_joined':
           this.addCollaborator(data.user);
           break;
         case 'user_left':
           this.removeCollaborator(data.user.id);
           break;
         case 'cursor_update':
           this.updateCursor(data.user.id, data.position);
           break;
         case 'document_update':
           this.updateDocument(data.operation);
           break;
       }
     }
     
     addCollaborator(user) {
       this.collaborators.push(user);
       this.renderCollaborators();
     }
     
     removeCollaborator(userId) {
       this.collaborators = this.collaborators.filter(c => c.id !== userId);
       this.renderCollaborators();
     }
     
     updateCursor(userId, position) {
       const cursor = document.querySelector(`[data-user-id="${userId}"] .cursor-indicator`);
       if (cursor) {
         cursor.style.left = `${position.x}px`;
         cursor.style.top = `${position.y}px`;
       }
     }
     
     sendCursorPosition(position) {
       this.socket.send(JSON.stringify({
         type: 'cursor_update',
         position: position
       }));
     }
     
     sendDocumentOperation(operation) {
       this.socket.send(JSON.stringify({
         type: 'document_update',
         operation: operation
       }));
     }
     
     renderCollaborators() {
       const list = document.querySelector('.collab-list');
       list.innerHTML = this.collaborators.map(user => `
         <div class="collab-user" data-user-id="${user.id}">
           <div class="avatar" style="background: ${user.color}">${user.name[0]}</div>
           <div class="user-info">
             <div class="user-name">${user.name}</div>
             <div class="user-status">${user.status}</div>
           </div>
           <div class="cursor-indicator" style="background: ${user.color}"></div>
         </div>
       `).join('');
     }
   }
   ```

3. 添加CSS样式
   ```css
   .collaboration-panel {
     width: 250px;
     border-left: 0.5px solid hsl(var(--border-300) / 0.12);
     background: hsl(var(--bg-100));
   }
   
   .collab-header {
     display: flex;
     justify-content: space-between;
     align-items: center;
     padding: 12px;
     border-bottom: 0.5px solid hsl(var(--border-300) / 0.12);
   }
   
   .collab-header h3 {
     font-size: 14px;
     font-weight: 600;
     color: hsl(var(--text-100));
     margin: 0;
   }
   
   .invite-btn {
     padding: 4px 8px;
     border-radius: 4px;
     background: hsl(var(--accent-000));
     color: white;
     border: none;
     cursor: pointer;
     font-size: 12px;
   }
   
   .collab-list {
     padding: 12px;
   }
   
   .collab-user {
     display: flex;
     align-items: center;
     gap: 8px;
     padding: 8px;
     border-radius: 6px;
     margin-bottom: 8px;
     background: hsl(var(--bg-200));
     position: relative;
   }
   
   .collab-user .avatar {
     width: 32px;
     height: 32px;
     border-radius: 50%;
     display: flex;
     align-items: center;
     justify-content: center;
     font-weight: 600;
     color: white;
   }
   
   .collab-user .user-info {
     flex: 1;
   }
   
   .collab-user .user-name {
     font-weight: 500;
     color: hsl(var(--text-100));
   }
   
   .collab-user .user-status {
     font-size: 12px;
     color: hsl(var(--text-500));
   }
   
   .cursor-indicator {
     position: absolute;
     width: 2px;
     height: 16px;
     border-radius: 1px;
     animation: blink 1s infinite;
   }
   
   @keyframes blink {
     0%, 50% { opacity: 1; }
     51%, 100% { opacity: 0; }
   }
   ```

**验收标准**：
- [ ] 协作者列表显示在侧边栏
- [ ] 显示协作者头像和状态
- [ ] 显示实时光标位置
- [ ] 支持邀请新协作者
- [ ] 协作者加入/离开有通知

---

## 实施时间表

### 第一阶段：基础UX现代化（2-3周）
- 周1：侧边栏重构
- 周2：消息级搜索 + 消息入场动画
- 周3：移动端触摸目标优化

### 第二阶段：对话灵活性（3-4周）
- 周4-5：消息编辑功能增强
- 周6-7：对话分支功能
- 周8-9：文件上传功能
- 周10：语音输入功能

### 第三阶段：视觉身份提升（2-3周）
- 周11-12：知识图谱可视化
- 周13-14：代理模式分屏视图
- 周15：更丰富的微交互动画 + 移动手势交互

### 第四阶段：高级功能（4-6周）
- 周16-18：Markdown WYSIWYG编辑器
- 周19-20：推理时间线
- 周21-22：代码沙箱集成
- 周23-24：工作区协作

---

## 成功指标

### 用户体验指标
- 新用户首次对话时间 < 30秒
- 会话恢复时间 < 2秒
- 移动端任务完成率提升20%
- 用户满意度评分提升15%

### 技术指标
- 首次内容绘制 < 1.5秒
- 交互响应时间 < 100毫秒
- 内存使用减少20%（通过虚拟化）
- 移动端性能评分 > 90（Lighthouse）

---

## 风险与缓解措施

### 技术风险
1. **性能下降**
   - 缓解：实施消息虚拟化，使用Web Worker处理繁重计算
   - 监控：定期进行性能测试，设置性能预算

2. **兼容性问题**
   - 缓解：渐进增强，确保核心功能在所有浏览器工作
   - 测试：跨浏览器测试，包括移动端Safari和Chrome

3. **复杂度增加**
   - 缓解：模块化设计，清晰的组件边界
   - 文档：详细的API文档和使用示例

### 用户接受风险
1. **学习曲线**
   - 缓解：渐进式功能发布，保留现有工作流
   - 引导：交互式教程和工具提示

2. **功能过载**
   - 缓解：可配置的功能开关，允许用户自定义界面
   - 反馈：定期用户调研，根据反馈调整优先级

---

## 结论

本行动方案提供了从当前Socrates应用到现代化AI聊天界面的完整升级路径。通过四个阶段的渐进式改进，我们将在保持Socrates独特Socratic教学风格的同时，大幅提升用户体验和功能丰富度。

关键成功因素：
1. **渐进式发布**：每个阶段都有明确的交付成果
2. **用户反馈驱动**：定期收集用户反馈并调整优先级
3. **性能优先**：确保每个功能都经过性能优化
4. **可维护性**：模块化设计确保长期可维护性

通过实施此方案，Socrates将成为一个既保持教育深度又具备现代用户体验的AI学习平台，真正实现"learn anything, step by step"的愿景。
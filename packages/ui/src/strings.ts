/* Shared UI strings for @socrates/ui (DOM-free). Components take an
 * optional `language` prop (default 'en'); the host app passes its settings
 * language down. Dictionaries live next to the components so labels never
 * drift from the markup that renders them. */

export type UiLanguage = 'en' | 'zh';

function en() {
  return {
    brand: 'Socrates',
    newChat: 'New chat',
    conversations: 'Conversations',
    untitled: 'Untitled',
    showArchived: (count: number) => `Show archived conversations (${count})`,
    hideArchived: 'Hide archived conversations',
    restoreSession: (title: string) => `Restore ${title}`,
    noArchived: 'No archived conversations.',
    emptyChat: 'How can I help you learn today?',
    messagePlaceholder: 'Message Socrates',
    sendMessage: 'Send message',
    stopGenerating: 'Stop generating',
    attachPhotos: 'Attach photos',
    attachFile: 'Attach a file',
    takePhoto: 'Take a photo',
    removeAttachment: (name: string) => `Remove ${name}`,
    startVoiceInput: 'Start voice input',
    stopVoiceInput: 'Stop voice input',
    toggleReasoning: 'Toggle reasoning',
    reasoning: 'Reasoning',
    listenMessage: 'Listen to this message',
    listen: '🔊 Listen',
    copyCode: 'Copy code',
    copied: 'Copied',
    copyFailed: 'Copy failed',
    code: 'Code',
    toggleToolDetails: (name: string) => `Toggle ${name} details`,
    toolFailed: 'Failed',
    toolCompleted: 'Completed',
    toolRunning: 'Running',
    thinking: '…',
  };
}

export type UiStrings = ReturnType<typeof en>;

const zh: UiStrings = {
  brand: 'Socrates',
  newChat: '新对话',
  conversations: '会话',
  untitled: '未命名',
  showArchived: (count: number) => `显示已归档会话 (${count})`,
  hideArchived: '隐藏已归档会话',
  restoreSession: (title: string) => `恢复 ${title}`,
  noArchived: '没有已归档会话。',
  emptyChat: '今天想学点什么？',
  messagePlaceholder: '给 Socrates 发消息',
  sendMessage: '发送',
  stopGenerating: '停止生成',
  attachPhotos: '添加图片',
  attachFile: '添加文件',
  takePhoto: '拍照',
  removeAttachment: (name: string) => `移除 ${name}`,
  startVoiceInput: '开始语音输入',
  stopVoiceInput: '停止语音输入',
  toggleReasoning: '切换思考过程',
  reasoning: '思考过程',
  listenMessage: '朗读这条消息',
  listen: '🔊 朗读',
  copyCode: '复制代码',
  copied: '已复制',
  copyFailed: '复制失败',
  code: '代码',
  toggleToolDetails: (name: string) => `切换 ${name} 详情`,
  toolFailed: '失败',
  toolCompleted: '已完成',
  toolRunning: '运行中',
  thinking: '…',
};

export function uiStrings(language: UiLanguage = 'en'): UiStrings {
  return language === 'zh' ? zh : en();
}

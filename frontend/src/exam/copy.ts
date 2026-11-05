/** SPA copy for the shared exam surface. Chinese/English come from the same
 *  `examUiL` helper the old DOM view used, so wording and the language-switch
 *  refresh behave exactly as before. */
import type { ExamStrings } from '@socrates/ui/exam';
import { examUiL } from './ui.ts';

export interface ExamChromeCopy {
  cancel: string;
  close: string;
  generate: string;
  submit: string;
  newExam: string;
  tryAgain: string;
  back: string;
  addModel: string;
  noQuestions: string;
  cancelled: string;
}

export function buildExamStrings(): ExamStrings {
  const L = examUiL;
  return {
    setup: {
      eyebrow: L('Assessment studio', '测评工作室'),
      heroTitle: L('Build a focused practice exam', '创建一份专注的练习考卷'),
      heroDescription: L('Choose the scope and challenge. Socrates will compose a balanced paper you can complete at your own pace.', '确定范围与难度，Socrates 会生成一份结构均衡、可按自己节奏完成的考卷。'),
      topic: L('Topic', '主题'),
      topicHelp: L('Name the subject or learning objective', '填写学科、章节或学习目标'),
      topicPlaceholder: L('e.g. Linear Algebra, World War II...', '如：线性代数、量子力学、二战…'),
      settings: L('Paper settings', '考卷设置'),
      settingsHelp: L('Select the model, difficulty, and length', '选择生成模型、难度与题量'),
      model: L('Model', '生成模型'),
      modelPlaceholder: L('Select a model', '选择模型'),
      noModels: L('No models available', '无可用模型'),
      difficulty: L('Difficulty', '难度'),
      count: L('Number of questions', '题目数量'),
      fewer: L('Fewer', '减少'),
      more: L('More', '增加'),
      types: L('Question types', '题型'),
      typesHelp: L('Keep at least one response format', '至少保留一种作答形式'),
      typeCards: {
        mc: { title: L('Multiple choice', '选择题'), hint: L('Choose one answer', '从选项中选择答案') },
        fb: { title: L('Fill blank', '填空题'), hint: L('Recall key terms', '回忆关键概念或结果') },
        sa: { title: L('Short answer', '简答题'), hint: L('Explain your reasoning', '用自己的语言说明推理') },
      },
      instructions: L('Detailed instructions (optional)', '详细说明（可选）'),
      instructionsHelp: L('Optional constraints for the examiner', '可选，补充覆盖范围或出题偏好'),
      instructionsPlaceholder: L('Specific topics to cover, or leave blank...', '具体说明要覆盖的知识点，留空则由 AI 决定…'),
      difficulties: {
        beginner: L('Beginner', '入门'),
        intermediate: L('Intermediate', '中级'),
        hard: L('Hard', '困难'),
        expert: L('Expert', '专家'),
      },
    },
    questions: {
      number: (n, total) => `${L('Question', '题目')} ${n} / ${total}`,
      type: {
        'multiple-choice': L('Multiple choice', '选择题'),
        'fill-blank': L('Fill blank', '填空题'),
        'short-answer': L('Short answer', '简答题'),
      },
      answerLabel: (n) => `${L('Answer for question ', '第 ')}${n}${L('', ' 题答案')}`,
      answerPlaceholder: L('Type your answer…', '输入你的答案…'),
      missing: L('Answer every question before submitting.', '请完成所有题目后再提交。'),
    },
    nav: {
      previous: L('Previous question', '上一题'),
      next: L('Next question', '下一题'),
      answered: L('answered', '已答'),
    },
  };
}

export function buildExamChrome(): ExamChromeCopy {
  const L = examUiL;
  return {
    cancel: L('Cancel', '取消'),
    close: L('Close', '关闭'),
    generate: L('Generate Exam', '生成考试'),
    submit: L('Submit for Grading', '提交批改'),
    newExam: L('New Exam', '新考试'),
    tryAgain: L('Try again', '重新出题'),
    back: L('Back', '返回'),
    addModel: L('Add and select a model in Settings first', '请先在设置中添加并选择一个模型'),
    noQuestions: L('Generation failed — no questions', '生成失败：没有成功生成任何题目'),
    cancelled: L('Generation cancelled', '已取消出题'),
  };
}

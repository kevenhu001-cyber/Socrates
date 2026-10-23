import { interfaceIcon } from '../../ui/icons/interfaceIcons';
// frontend/src/extensions/modules/exam.ts

import type { ExtensionDefinition } from '../types';

export const EXAM_ICON = interfaceIcon('exam', 18);

interface ExamWindow {
  state?: { _examInView?: boolean };
  openExamPanel?: () => void;
  openExamModal?: () => void;
  closeExamView?: () => void;
}

export const examExtension: ExtensionDefinition = {
  key: 'exam',
  kind: 'action',
  nameKey: 'composer.exam',
  nameFallback: 'Generate exam',
  descriptionKey: 'composer.examHint',
  descriptionFallback: 'Blueprint, questions and grading',
  hintKey: 'composer.examHint',
  hintFallback: 'Blueprint, questions and grading',
  icon: EXAM_ICON,
  placement: { tools: 7, picker: 3 },
  onActivate(ctx) {
    const w = window as unknown as ExamWindow;
    const inView = !!w.state?._examInView;
    // Toggle: if the panel is already open, close it instead of
    // re-opening. closeExamView() flips state._examInView and sets
    // state.examCancel so any in-flight generation loop bails.
    if (inView && typeof w.closeExamView === 'function') {
      w.closeExamView();
      return;
    }
    if (ctx.openNav) {
      ctx.openNav('exam');
    } else if (typeof w.openExamPanel === 'function') {
      w.openExamPanel();
    } else if (typeof w.openExamModal === 'function') {
      w.openExamModal();
    }
  },
  onDeactivate() {
    // Safety net: when another extension takes over (e.g. user picks
    // a template after opening the exam), close the exam panel so it
    // doesn't linger behind the new template's UI.
    const w = window as unknown as ExamWindow;
    if (w.state?._examInView && typeof w.closeExamView === 'function') {
      w.closeExamView();
    }
  },
};

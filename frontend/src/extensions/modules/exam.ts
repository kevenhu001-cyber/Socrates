import { interfaceIcon } from '../../ui/icons/interfaceIcons';
// frontend/src/extensions/modules/exam.ts

import type { ExtensionDefinition } from '../types';
import { stateStore } from '../../state/store.ts';
import { reportSwallow } from '../../util/reportSwallow.ts';

function runExamCommand(command: 'openExamPanel' | 'closeExamView') {
  void import('../../exam.ts').then((module) => module[command]()).catch((error) => {
    reportSwallow(error, `extensions.exam.${command}`);
  });
}

export const EXAM_ICON = interfaceIcon('exam', 18);

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
    const inView = !!stateStore.read('_examInView');
    // Toggle: if the panel is already open, close it instead of
    // re-opening. closeExamView() flips state._examInView and sets
    // state.examCancel so any in-flight generation loop bails.
    if (inView) {
      runExamCommand('closeExamView');
      return;
    }
    if (ctx.openNav) {
      ctx.openNav('exam');
    } else {
      runExamCommand('openExamPanel');
    }
  },
  onDeactivate() {
    // Safety net: when another extension takes over (e.g. user picks
    // a template after opening the exam), close the exam panel so it
    // doesn't linger behind the new template's UI.
    if (stateStore.read('_examInView')) {
      runExamCommand('closeExamView');
    }
  },
};

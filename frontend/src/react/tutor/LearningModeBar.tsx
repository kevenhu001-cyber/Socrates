/**
 * RN-4 web adapter for the shared learning-mode capsule
 * (packages/ui/src/think). The module draws; this file supplies copy (i18n)
 * and the session's mode store.
 *
 * The question chain itself was retired from the transcript on 2026-11-16;
 * the learning-mode capsule remains next to the conversation composer.
 */
import { useSyncExternalStore } from 'react';
import { LEARNING_MODES, LearningModeSwitch, type LearningModeOption } from '@socrates/ui/think';
import { WebUiTheme, useLocaleRefresh } from '../rn/WebUiTheme';
import { i18n } from '../../ui/legacyI18n.ts';
import {
  chooseLearningMode,
  getLearningMode,
  subscribeLearningMode,
} from '../../tutor/learningMode.ts';

function learningModeOptions(): LearningModeOption[] {
  return LEARNING_MODES.map((mode) => {
    const modeLabel = i18n(mode.labelKey, mode.id);
    return {
      id: mode.id,
      label: i18n(`learnMode.session.${mode.id}.label`, modeLabel),
      hint: i18n(`learnMode.session.${mode.id}.hint`, i18n(mode.hintKey, '')),
      triggerLabel: modeLabel,
    };
  });
}

function useLearningMode() {
  return useSyncExternalStore(subscribeLearningMode, getLearningMode);
}

export function SessionLearningModes() {
  useLocaleRefresh();
  const mode = useLearningMode();
  return (
    <WebUiTheme>
      <LearningModeSwitch
        variant="menu"
        options={learningModeOptions()}
        value={mode}
        label={i18n('learnMode.label', 'Learning mode')}
        triggerLabel={i18n('learnMode.trigger', 'Mode: {mode}')}
        onChange={(id) => {
          void chooseLearningMode(id, 'session');
        }}
      />
    </WebUiTheme>
  );
}

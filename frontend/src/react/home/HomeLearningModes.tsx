/**
 * RN-4 — landing-page learning modes: the shared capsule segmented control
 * (packages/ui/src/think) bound to the shell's mode store. Choosing a mode
 * switches to Tutor when needed and runs the mode's entry action.
 */
/* Must run before any react-native-web module evaluates (see rnwGlobal.ts). */
import '../rn/rnwGlobal';
import { LearningModeSwitch } from '@socrates/ui/think';
import { WebUiTheme, useLocaleRefresh } from '../rn/WebUiTheme';
import { i18n } from '../legacy/gateway.ts';
import { chooseLearningMode } from '../../tutor/learningMode.ts';
import { learningModeOptions, useLearningMode } from '../tutor/QuestionChainRoot';
import { useAppMode } from '../app-mode/useAppMode';

export function HomeLearningModes() {
  useLocaleRefresh();
  const mode = useLearningMode();
  const appMode = useAppMode();
  return (
    <WebUiTheme>
      <LearningModeSwitch
        testID="home-learning-modes"
        variant="row"
        options={learningModeOptions()}
        /* In Chat mode no learning mode is active yet: nothing is selected,
           and choosing one switches to Tutor. */
        value={appMode === 'tutor' ? mode : null}
        showHint={appMode === 'tutor'}
        label={i18n('learnMode.label', 'Learning mode')}
        onChange={(id) => { void chooseLearningMode(id, 'home'); }}
      />
    </WebUiTheme>
  );
}

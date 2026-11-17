import { Switch, type SwitchProps } from 'react-native';
import { SettingsSwitch } from '@socrates/ui/settings';
import { Label as ShadcnLabel } from '../ui/shadcn/label';
import { NativeControl as ShadcnNativeControl } from '../ui/NativeControl';
import { Button } from '../ui/shadcn/button';
import { ToggleGroup, ToggleGroupItem } from '../ui/shadcn/toggle-group';
import { WebUiTheme } from '../rn/WebUiTheme';
import {
  DISPLAY_FONT_STEPS,
  DISPLAY_WIDTH_STEPS,
  FONT_LABELS,
  WIDTH_LABELS,
} from '../../displayPrefs.ts';
import { settingsPreferenceActions, useSettingsPreferencesStore } from './settings.store';
import type { SettingsPaneProps } from './settings.types';

function WebSwitch({ thumbColor, ...props }: SwitchProps) {
  // RN Web exposes a separate thumb color for the checked state.
  const webProps = { activeThumbColor: thumbColor };
  return <Switch {...props} thumbColor={thumbColor} {...webProps} />;
}

/**
 * Display: text size, content width, grid and background. Every control writes
 * through `settingsPreferenceActions`, so the value comes back from one store
 * instead of a local copy that could lag behind the document.
 */
export function DisplaySettingsPane({ hidden, label }: SettingsPaneProps) {
  const display = useSettingsPreferencesStore((state) => state);
  const gridLabel = label('对话背景网格', 'Conversation grid');

  return (
    <section className="settings-pane" hidden={hidden}>
      <h2>{label('显示', 'Display')}</h2>
      <section className="settings-section">
        <div className="settings-section-head">
          <h3>{label('阅读与版式', 'Reading & layout')}</h3>
          <p>
            {label(
              '调整对话文字大小、内容宽度和背景。',
              'Adjust conversation text size, content width, and background.',
            )}
          </p>
        </div>
        <div className="settings-choice settings-choice--segmented">
          <span className="settings-choice-label" id="settings-font-size-label">
            {label('文字大小', 'Text size')}
          </span>
          <ToggleGroup
            variant="outline"
            value={[String(display.font)]}
            onValueChange={(values) => {
              if (values[0]) settingsPreferenceActions.setFont(Number(values[0]));
            }}
            aria-labelledby="settings-font-size-label"
          >
            {DISPLAY_FONT_STEPS.map((step, index) => (
              <ToggleGroupItem key={step} type="button" value={String(step)}>
                {FONT_LABELS[index]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="settings-choice settings-choice--segmented">
          <span className="settings-choice-label" id="settings-content-width-label">
            {label('内容宽度', 'Content width')}
          </span>
          <ToggleGroup
            variant="outline"
            value={[String(display.width)]}
            onValueChange={(values) => {
              if (values[0]) settingsPreferenceActions.setWidth(Number(values[0]));
            }}
            aria-labelledby="settings-content-width-label"
          >
            {DISPLAY_WIDTH_STEPS.map((step, index) => (
              <ToggleGroupItem key={step} type="button" value={String(step)}>
                {WIDTH_LABELS[index]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <ShadcnLabel className="settings-choice">
          {gridLabel}
          <WebUiTheme>
            <SettingsSwitch
              control={WebSwitch}
              label={gridLabel}
              value={display.showGrid}
              onValueChange={settingsPreferenceActions.setGrid}
            />
          </WebUiTheme>
        </ShadcnLabel>
        <div className="settings-choice settings-choice--color">
          <span className="settings-choice-label">
            {label('自定义背景色', 'Custom background')}
          </span>
          <div className="settings-bg-pickers">
            <ShadcnLabel className="settings-bg-picker">
              <ShadcnNativeControl
                type="color"
                value={display.darkBg || '#09090b'}
                onChange={(event) =>
                  settingsPreferenceActions.setDarkBackground(event.target.value)
                }
              />
              <span>{label('深色', 'Dark')}</span>
            </ShadcnLabel>
            <Button
              variant="outline"
              type="button"
              onClick={() => settingsPreferenceActions.resetDarkBackground()}
            >
              {label('重置', 'Reset')}
            </Button>
            <ShadcnLabel className="settings-bg-picker">
              <ShadcnNativeControl
                type="color"
                value={display.lightBg || '#ffffff'}
                onChange={(event) =>
                  settingsPreferenceActions.setLightBackground(event.target.value)
                }
              />
              <span>{label('浅色', 'Light')}</span>
            </ShadcnLabel>
            <Button
              variant="outline"
              type="button"
              onClick={() => settingsPreferenceActions.resetLightBackground()}
            >
              {label('重置', 'Reset')}
            </Button>
          </div>
        </div>
      </section>
    </section>
  );
}

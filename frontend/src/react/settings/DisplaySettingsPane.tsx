import { PageTabs } from '../ui/page/PageTabs';
import { Switch } from '../ui/v3';
import { Label as ShadcnLabel } from '../ui/shadcn/label';
import { NativeControl as ShadcnNativeControl } from '../ui/NativeControl';
import { Button } from '../ui/shadcn/button';
import { SettingsRow } from '../layout/SettingsRow';
import {
  DISPLAY_FONT_STEPS,
  DISPLAY_WIDTH_STEPS,
  FONT_LABELS,
  WIDTH_LABELS,
} from '../../displayPrefs.ts';
import { settingsPreferenceActions, useSettingsPreferencesStore } from './settings.store';
import type { SettingsPaneProps } from './settings.types';

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
        <SettingsRow
          labelId="settings-font-size-label"
          label={label('文字大小', 'Text size')}
          labelClassName="settings-choice-label"
          className="settings-choice settings-choice--segmented"
          control={
            <PageTabs
              ariaLabel={label('文字大小', 'Text size')}
              value={String(display.font)}
              onChange={(val) => settingsPreferenceActions.setFont(Number(val))}
              items={DISPLAY_FONT_STEPS.map((step, index) => ({
                value: String(step),
                label: FONT_LABELS[index],
              }))}
            />
          }
        />
        <SettingsRow
          labelId="settings-content-width-label"
          label={label('内容宽度', 'Content width')}
          labelClassName="settings-choice-label"
          className="settings-choice settings-choice--segmented"
          control={
            <PageTabs
              ariaLabel={label('内容宽度', 'Content width')}
              value={String(display.width)}
              onChange={(val) => settingsPreferenceActions.setWidth(Number(val))}
              items={DISPLAY_WIDTH_STEPS.map((step, index) => ({
                value: String(step),
                label: WIDTH_LABELS[index],
              }))}
            />
          }
        />
        <SettingsRow
          htmlFor="settings-conversation-grid"
          label={gridLabel}
          className="settings-choice settings-choice--switch"
          control={
            <Switch
              id="settings-conversation-grid"
              aria-label={gridLabel}
              checked={display.showGrid}
              onCheckedChange={settingsPreferenceActions.setGrid}
            />
          }
        />
        <SettingsRow
          label={label('深色背景', 'Dark background')}
          labelClassName="settings-choice-label"
          className="settings-choice settings-choice--color"
          control={
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
            </div>
          }
        />
        <SettingsRow
          label={label('浅色背景', 'Light background')}
          labelClassName="settings-choice-label"
          className="settings-choice settings-choice--color"
          control={
            <div className="settings-bg-pickers">
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
          }
        />
      </section>
    </section>
  );
}

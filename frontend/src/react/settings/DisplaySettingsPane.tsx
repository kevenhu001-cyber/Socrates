import { PageTabs } from '../ui/page/PageTabs';
import { Switch } from '../ui/shadcn/switch';
import { Label as ShadcnLabel } from '../ui/shadcn/label';
import { NativeControl as ShadcnNativeControl } from '../ui/NativeControl';
import { Button } from '../ui/shadcn/button';
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
        <div className="settings-choice settings-choice--segmented">
          <span className="settings-choice-label" id="settings-font-size-label">
            {label('文字大小', 'Text size')}
          </span>
          <PageTabs
            ariaLabel={label('文字大小', 'Text size')}
            value={String(display.font)}
            onChange={(val) => settingsPreferenceActions.setFont(Number(val))}
            items={DISPLAY_FONT_STEPS.map((step, index) => ({
              value: String(step),
              label: FONT_LABELS[index],
            }))}
          />
        </div>
        <div className="settings-choice settings-choice--segmented">
          <span className="settings-choice-label" id="settings-content-width-label">
            {label('内容宽度', 'Content width')}
          </span>
          <PageTabs
            ariaLabel={label('内容宽度', 'Content width')}
            value={String(display.width)}
            onChange={(val) => settingsPreferenceActions.setWidth(Number(val))}
            items={DISPLAY_WIDTH_STEPS.map((step, index) => ({
              value: String(step),
              label: WIDTH_LABELS[index],
            }))}
          />
        </div>
        <div className="settings-choice settings-choice--switch">
          <ShadcnLabel htmlFor="settings-conversation-grid">{gridLabel}</ShadcnLabel>
          <Switch
            id="settings-conversation-grid"
            aria-label={gridLabel}
            checked={display.showGrid}
            onCheckedChange={settingsPreferenceActions.setGrid}
          />
        </div>
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

import { Label as ShadcnLabel } from '../ui/shadcn/label';
import { NativeControl as ShadcnNativeControl } from '../ui/NativeControl';
import { Button } from '../ui/shadcn/button';
import { ToggleGroup, ToggleGroupItem } from '../ui/shadcn/toggle-group';
import { Switch } from '../ui/shadcn/switch';
import { useState } from 'react';
import {
  displayPrefs,
  setDisplayFont,
  setDisplayWidth,
  toggleGrid,
  setBackgroundDark,
  setBackgroundLight,
  resetBackgroundDark,
  resetBackgroundLight,
  DISPLAY_FONT_STEPS,
  DISPLAY_WIDTH_STEPS,
  FONT_LABELS,
  WIDTH_LABELS,
} from '../../displayPrefs.js';
import type { SettingsPaneProps } from './settings.types';

export function DisplaySettingsPane({ hidden, label }: SettingsPaneProps) {
  /* Mirror the live preference module so segmented controls update at once. */
  const [display, setDisplay] = useState(() => ({ ...displayPrefs }));
  const apply = (mutation: () => void) => {
    mutation();
    setDisplay({ ...displayPrefs });
  };

  return (
    <section className="settings-pane" hidden={hidden}>
      <h2>{label('外观', 'Display')}</h2>
      <div className="settings-field">
        <span className="settings-label">{label('文字大小', 'Text size')}</span>
        <ToggleGroup variant="outline" value={[String(display.font)]}
          onValueChange={(values) => { if (values[0]) apply(() => setDisplayFont(Number(values[0]))); }}
          aria-label={label('文字大小', 'Text size')}>
          {DISPLAY_FONT_STEPS.map((step, index) => (
            <ToggleGroupItem
              key={step}
              type="button"
              value={String(step)}
            >{FONT_LABELS[index]}</ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="settings-field">
        <span className="settings-label">{label('内容宽度', 'Content width')}</span>
        <ToggleGroup variant="outline" value={[String(display.width)]}
          onValueChange={(values) => { if (values[0]) apply(() => setDisplayWidth(Number(values[0]))); }}
          aria-label={label('内容宽度', 'Content width')}>
          {DISPLAY_WIDTH_STEPS.map((step, index) => (
            <ToggleGroupItem
              key={step}
              type="button"
              value={String(step)}
            >{WIDTH_LABELS[index]}</ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <ShadcnLabel className="settings-choice">{label('对话背景网格', 'Conversation grid')}
        <Switch
          checked={display.showGrid !== false}
          onCheckedChange={() => apply(() => toggleGrid())}
        />
      </ShadcnLabel>
      <div className="settings-field">
        <span className="settings-label">{label('自定义背景色', 'Custom background')}</span>
        <div className="settings-bg-pickers">
          <ShadcnLabel className="settings-bg-picker">
            <ShadcnNativeControl type="color" value={display.darkBg || '#09090b'} onChange={(event) => apply(() => setBackgroundDark(event.target.value))} />
            <span>{label('深色', 'Dark')}</span>
          </ShadcnLabel>
          <Button variant="outline" type="button" onClick={() => apply(() => resetBackgroundDark())}>{label('重置', 'Reset')}</Button>
          <ShadcnLabel className="settings-bg-picker">
            <ShadcnNativeControl type="color" value={display.lightBg || '#ffffff'} onChange={(event) => apply(() => setBackgroundLight(event.target.value))} />
            <span>{label('浅色', 'Light')}</span>
          </ShadcnLabel>
          <Button variant="outline" type="button" onClick={() => apply(() => resetBackgroundLight())}>{label('重置', 'Reset')}</Button>
        </div>
      </div>
    </section>
  );
}

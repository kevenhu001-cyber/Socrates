import { Button } from '../ui/Button';
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
        <div className="display-prefs-segs" role="group" aria-label={label('文字大小', 'Text size')}>
          {DISPLAY_FONT_STEPS.map((step, index) => (
            <Button
              key={step}
              type="button"
              className={'display-prefs-seg' + (display.font === step ? ' on' : '')}
              aria-pressed={display.font === step}
              onClick={() => apply(() => setDisplayFont(step))}
            >{FONT_LABELS[index]}</Button>
          ))}
        </div>
      </div>
      <div className="settings-field">
        <span className="settings-label">{label('内容宽度', 'Content width')}</span>
        <div className="display-prefs-segs" role="group" aria-label={label('内容宽度', 'Content width')}>
          {DISPLAY_WIDTH_STEPS.map((step, index) => (
            <Button
              key={step}
              type="button"
              className={'display-prefs-seg' + (display.width === step ? ' on' : '')}
              aria-pressed={display.width === step}
              onClick={() => apply(() => setDisplayWidth(step))}
            >{WIDTH_LABELS[index]}</Button>
          ))}
        </div>
      </div>
      <label className="settings-choice">{label('对话背景网格', 'Conversation grid')}
        <Button
          type="button"
          className={'stg-toggle-track' + (display.showGrid !== false ? ' on' : '')}
          role="switch"
          aria-checked={display.showGrid !== false}
          onClick={() => apply(() => toggleGrid())}
        >
          <span className="stg-toggle-knob" />
        </Button>
      </label>
      <div className="settings-field">
        <span className="settings-label">{label('自定义背景色', 'Custom background')}</span>
        <div className="settings-bg-pickers">
          <label className="settings-bg-picker">
            <input type="color" value={display.darkBg || '#09090b'} onChange={(event) => apply(() => setBackgroundDark(event.target.value))} />
            <span>{label('深色', 'Dark')}</span>
          </label>
          <Button type="button" className="btn" onClick={() => apply(() => resetBackgroundDark())}>{label('重置', 'Reset')}</Button>
          <label className="settings-bg-picker">
            <input type="color" value={display.lightBg || '#ffffff'} onChange={(event) => apply(() => setBackgroundLight(event.target.value))} />
            <span>{label('浅色', 'Light')}</span>
          </label>
          <Button type="button" className="btn" onClick={() => apply(() => resetBackgroundLight())}>{label('重置', 'Reset')}</Button>
        </div>
      </div>
    </section>
  );
}

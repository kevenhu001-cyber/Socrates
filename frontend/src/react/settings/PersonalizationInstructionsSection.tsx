import { Textarea as ShadcnTextarea } from '../ui/shadcn/textarea';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/shadcn/card';
import { Field, FieldGroup, FieldLabel } from '../ui/shadcn/field';
import type { SaveSettingsPreference, SettingsLabel } from './settings.types';

export function PersonalizationInstructionsSection({
  language,
  label,
  value,
  onChange,
  savePreference,
  reportSaveError,
}: {
  language: 'zh' | 'en';
  label: SettingsLabel;
  value: string;
  onChange: (value: string) => void;
  savePreference: SaveSettingsPreference;
  reportSaveError: (message: string) => void;
}) {
  const handleChange = (nextValue: string) => {
    onChange(nextValue);
    try {
      localStorage.setItem('socrates-custom-instructions', nextValue);
    } catch {
      reportSaveError(label('无法保存在此设备。', 'Could not save on this device.'));
    }
    void savePreference({ customInstructions: nextValue });
  };

  return (
    <Card className="settings-section">
      <CardHeader className="settings-section-head">
        <CardTitle>{label('自定义指令', 'Custom instructions')}</CardTitle>
        <CardDescription>{label(
          '希望助手了解你什么，或者以怎样的风格与格式回答。',
          'What would you like the assistant to know about you to provide better responses.',
        )}</CardDescription>
      </CardHeader>
      <CardContent><FieldGroup><Field>
      <FieldLabel className="sr-only" htmlFor="settings-custom-instructions">{label('自定义指令', 'Custom instructions')}</FieldLabel>
      <ShadcnTextarea
        id="settings-custom-instructions"
        className="settings-textarea"
        rows={3}
        value={value}
        placeholder={language === 'zh'
          ? '例如：我是高中物理老师，喜欢结构化、带有举例说明的清晰回答。'
          : 'e.g. I am a physics student; prefer concise, step-by-step explanations with examples.'}
        onChange={(event) => handleChange(event.target.value)}
      />
      </Field></FieldGroup></CardContent>
    </Card>
  );
}

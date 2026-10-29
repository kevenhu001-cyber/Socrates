import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '../ui/shadcn/button';
import { Field, FieldGroup, FieldLabel } from '../ui/shadcn/field';
import { Input } from '../ui/shadcn/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../ui/shadcn/select';
import { Textarea } from '../ui/shadcn/textarea';
import { ToggleGroup, ToggleGroupItem } from '../ui/shadcn/toggle-group';

export type ExamSetupSnapshot = {
  key: number;
  locale: 'en' | 'zh';
  topic: string;
  instructions: string;
  count: string;
  model: string;
  difficulty: string;
  selectedTypes: { mc: boolean; fb: boolean; sa: boolean };
  providers: Array<{ id: string; label: string }>;
  text: {
    eyebrow: string;
    heroTitle: string;
    heroDescription: string;
    topic: string;
    topicHelp: string;
    topicPlaceholder: string;
    settings: string;
    settingsHelp: string;
    model: string;
    modelPlaceholder: string;
    noModels: string;
    difficulty: string;
    count: string;
    fewer: string;
    more: string;
    types: string;
    typesHelp: string;
    multipleChoice: string;
    multipleChoiceHelp: string;
    fillBlank: string;
    fillBlankHelp: string;
    shortAnswer: string;
    shortAnswerHelp: string;
    instructions: string;
    instructionsHelp: string;
    instructionsPlaceholder: string;
    cancel: string;
    generate: string;
    beginner: string;
    intermediate: string;
    hard: string;
    expert: string;
  };
};

type ExamSetupProps = {
  snapshot: ExamSetupSnapshot;
  commandHost: HTMLElement;
};

const DIFFICULTIES = ['beginner', 'intermediate', 'hard', 'expert'] as const;
const TYPES = ['mc', 'fb', 'sa'] as const;

function dispatchExamCommand(host: HTMLElement, command: string, payload: Record<string, unknown> = {}) {
  host.dispatchEvent(new CustomEvent('socrates:exam-command', {
    detail: { command, ...payload },
  }));
}

function sectionHeader(index: string, title: string, description: string) {
  return (
    <div className="exam-form-section-header">
      <span className="exam-section-index">{index}</span>
      <span>
        <span className="exam-form-section-title">{title}</span>
        <small>{description}</small>
      </span>
    </div>
  );
}

function ExamSetupBody({ snapshot, commandHost }: ExamSetupProps) {
  const { text } = snapshot;
  const [difficulty, setDifficulty] = useState(snapshot.difficulty);
  const [selectedTypes, setSelectedTypes] = useState(snapshot.selectedTypes);
  const [model, setModel] = useState(snapshot.model);
  const activeTypes = TYPES.filter((type) => selectedTypes[type]);

  function onDifficultyChange(values: string[]) {
    const next = values[values.length - 1];
    if (!next || !DIFFICULTIES.includes(next as typeof DIFFICULTIES[number])) return;
    setDifficulty(next);
    dispatchExamCommand(commandHost, 'set-difficulty', { difficulty: next });
  }

  function onTypesChange(values: string[]) {
    if (!values.length) return;
    const next = Object.fromEntries(TYPES.map((type) => [type, values.includes(type)])) as ExamSetupSnapshot['selectedTypes'];
    setSelectedTypes(next);
    dispatchExamCommand(commandHost, 'set-types', { selectedTypes: next });
  }

  return (
    <div className="exam-form-container">
      <header className="exam-form-hero">
        <span className="exam-form-eyebrow">{text.eyebrow}</span>
        <h3>{text.heroTitle}</h3>
        <p>{text.heroDescription}</p>
      </header>

      <section className="exam-form-section">
        {sectionHeader('01', text.topic, text.topicHelp)}
        <FieldGroup className="gap-0">
          <Field>
            <FieldLabel className="sr-only" htmlFor="examTopic">{text.topic}</FieldLabel>
            <Input className="exam-form-input" id="examTopic" name="examTopic" autoComplete="off" placeholder={text.topicPlaceholder} defaultValue={snapshot.topic} />
          </Field>
        </FieldGroup>
      </section>

      <section className="exam-form-section">
        {sectionHeader('02', text.settings, text.settingsHelp)}
        <FieldGroup className="gap-0">
          <Field className="exam-form-field">
            <FieldLabel className="exam-form-label" htmlFor="examModelTrigger">{text.model}</FieldLabel>
            <div className="exam-model-wrap">
              <Select value={model || null} onValueChange={(value) => setModel(value || '')}>
                <SelectTrigger className="exam-model-trigger" id="examModelTrigger" aria-label={text.model}>
                  <SelectValue className="exam-model-label" placeholder={text.modelPlaceholder} />
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectGroup>
                    {snapshot.providers.length
                      ? snapshot.providers.map((provider) => <SelectItem key={provider.id} value={provider.id}>{provider.label}</SelectItem>)
                      : <SelectItem value="__no_models" disabled>{text.noModels}</SelectItem>}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Input id="examModel" type="hidden" value={model} readOnly />
            </div>
          </Field>

          <div className="exam-form-row">
            <Field className="exam-form-field">
              <FieldLabel className="exam-form-label">{text.difficulty}</FieldLabel>
              <ToggleGroup id="examDifficultySeg" value={[difficulty]} variant="outline" size="default" spacing={1} className="exam-seg" aria-label={text.difficulty} onValueChange={onDifficultyChange}>
                {DIFFICULTIES.map((value) => (
                  <ToggleGroupItem key={value} value={value} className={`exam-seg-btn${difficulty === value ? ' active' : ''}`}>
                    {text[value]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>

            <Field className="exam-form-field">
              <FieldLabel className="exam-form-label">{text.count}</FieldLabel>
              <div className="exam-stepper">
                <Button variant="ghost" size="icon-sm" className="exam-stepper-btn" type="button" data-exam-command="count" data-delta="-1" aria-label={text.fewer}><Minus data-icon="inline-start" /></Button>
                <span className="exam-stepper-val" id="examCountDisplay">{snapshot.count}</span>
                <Button variant="ghost" size="icon-sm" className="exam-stepper-btn" type="button" data-exam-command="count" data-delta="1" aria-label={text.more}><Plus data-icon="inline-start" /></Button>
                <Input id="examCount" type="hidden" defaultValue={snapshot.count} />
              </div>
            </Field>
          </div>
        </FieldGroup>
      </section>

      <section className="exam-form-section">
        {sectionHeader('03', text.types, text.typesHelp)}
        <ToggleGroup id="examTypePicker" value={activeTypes} variant="outline" size="lg" spacing={2} className="exam-form-card-toggles" aria-label={text.types} onValueChange={onTypesChange}>
          <ToggleGroupItem value="mc" className={`exam-form-toggle-card${selectedTypes.mc ? ' active' : ''}`}>
            <span className="tog-dot" />
            <span className="exam-type-copy"><strong>{text.multipleChoice}</strong><small>{text.multipleChoiceHelp}</small></span>
          </ToggleGroupItem>
          <ToggleGroupItem value="fb" className={`exam-form-toggle-card${selectedTypes.fb ? ' active' : ''}`}>
            <span className="tog-dot" />
            <span className="exam-type-copy"><strong>{text.fillBlank}</strong><small>{text.fillBlankHelp}</small></span>
          </ToggleGroupItem>
          <ToggleGroupItem value="sa" className={`exam-form-toggle-card${selectedTypes.sa ? ' active' : ''}`}>
            <span className="tog-dot" />
            <span className="exam-type-copy"><strong>{text.shortAnswer}</strong><small>{text.shortAnswerHelp}</small></span>
          </ToggleGroupItem>
        </ToggleGroup>
      </section>

      <section className="exam-form-section">
        {sectionHeader('04', text.instructions, text.instructionsHelp)}
        <FieldGroup className="gap-0">
          <Field>
            <FieldLabel className="sr-only" htmlFor="examInstructions">{text.instructions}</FieldLabel>
            <Textarea className="exam-form-textarea" id="examInstructions" name="examInstructions" placeholder={text.instructionsPlaceholder} rows={3} defaultValue={snapshot.instructions} />
          </Field>
        </FieldGroup>
      </section>
    </div>
  );
}

function ExamSetupFooter({ snapshot }: { snapshot: ExamSetupSnapshot }) {
  return (
    <>
      <Button variant="outline" data-exam-command="close">{snapshot.text.cancel}</Button>
      <Button data-exam-command="generate">{snapshot.text.generate}</Button>
    </>
  );
}

export { ExamSetupBody, ExamSetupFooter };

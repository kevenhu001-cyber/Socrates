import { useState } from 'react';
import { Input } from '../ui/shadcn/input';
import { Textarea } from '../ui/shadcn/textarea';
import { ToggleGroup, ToggleGroupItem } from '../ui/shadcn/toggle-group';

export type ExamQuestionOption = {
  letter: string;
  html: string;
};

export type ExamQuestionCardData = {
  index: number;
  total: number;
  type: string;
  questionLabel: string;
  typeLabel: string;
  questionHtml: string;
  options: ExamQuestionOption[];
  savedAnswer: number | string | null;
  answerLabel: string;
  placeholder: string;
};

type ExamQuestionCardProps = ExamQuestionCardData & {
  commandHost: HTMLElement;
};

function ExamQuestionCard({
  index,
  total,
  type,
  questionLabel,
  typeLabel,
  questionHtml,
  options,
  savedAnswer,
  answerLabel,
  placeholder,
  commandHost,
}: ExamQuestionCardProps) {
  const [selected, setSelected] = useState(savedAnswer == null ? '' : String(savedAnswer));
  const groupValue = selected ? [selected] : [];

  function onOptionChange(values: string[]) {
    const next = values[values.length - 1];
    if (!next) return;
    setSelected(next);
    commandHost.dispatchEvent(new CustomEvent('socrates:exam-command', {
      detail: { command: 'answer-option', eidx: index, oidx: Number(next) },
    }));
  }

  return (
    <>
      <div className="exam-q-num">
        {questionLabel} {index + 1} / {total}
        <span className="exam-q-type">{typeLabel}</span>
      </div>
      <div className={`exam-q-text${type === 'error' ? ' exam-q-error' : ''}`} dangerouslySetInnerHTML={{ __html: questionHtml }} />
      {type === 'multiple-choice' && options.length > 0 && (
        <ToggleGroup value={groupValue} variant="outline" size="lg" spacing={2} className="exam-q-opts" aria-label={answerLabel} onValueChange={onOptionChange}>
          {options.map((option, optionIndex) => (
            <ToggleGroupItem
              key={`${option.letter}-${optionIndex}`}
              value={String(optionIndex)}
              className={`exam-q-opt${selected === String(optionIndex) ? ' selected' : ''}`}
              data-eidx={index}
              data-oidx={optionIndex}
            >
              <span className="exam-q-opt-letter">{option.letter}</span>
              <span className="exam-q-opt-text" dangerouslySetInnerHTML={{ __html: option.html }} />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
      {type === 'fill-blank' && (
        <Input
          className="exam-q-fill-input"
          data-eidx={index}
          name={`examAnswer${index}`}
          aria-label={answerLabel}
          defaultValue={typeof savedAnswer === 'string' ? savedAnswer : ''}
          placeholder={placeholder}
        />
      )}
      {type === 'short-answer' && (
        <Textarea
          className="exam-q-fill-input min-h-20 resize-y"
          data-eidx={index}
          name={`examAnswer${index}`}
          aria-label={answerLabel}
          defaultValue={typeof savedAnswer === 'string' ? savedAnswer : ''}
          placeholder={placeholder}
          rows={3}
        />
      )}
    </>
  );
}

export { ExamQuestionCard };

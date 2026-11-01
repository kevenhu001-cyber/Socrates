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
  readOnly?: boolean;
  onOptionChange: (index: number, value: number) => void;
  onTextChange: (index: number, value: string) => void;
};

function ExamChoiceOptions({
  options,
  selected,
  readOnly,
  answerLabel,
  index,
  onOptionChange,
}: {
  options: ExamQuestionCardProps['options'];
  selected: string;
  readOnly: boolean;
  answerLabel: string;
  index: number;
  onOptionChange: (index: number, value: number) => void;
}) {
  if (readOnly) {
    return (
      <div className="exam-q-opts">
        {options.map((option, optionIndex) => (
          <div key={`${option.letter}-${optionIndex}`} className={`exam-q-opt${selected === String(optionIndex) ? ' selected' : ''}`}>
            <span className="exam-q-opt-letter">{option.letter}</span>
            <span className="exam-q-opt-text" dangerouslySetInnerHTML={{ __html: option.html }} />
            {selected === String(optionIndex) && <span className="exam-q-opt-check">✓</span>}
          </div>
        ))}
      </div>
    );
  }
  return (
    <ToggleGroup
      value={selected ? [selected] : []}
      variant="outline"
      size="lg"
      spacing={2}
      className="exam-q-opts"
      aria-label={answerLabel}
      onValueChange={(values) => {
        const next = values[values.length - 1];
        if (next !== undefined) onOptionChange(index, Number(next));
      }}
    >
      {options.map((option, optionIndex) => (
        <ToggleGroupItem
          key={`${option.letter}-${optionIndex}`}
          value={String(optionIndex)}
          className={`exam-q-opt${selected === String(optionIndex) ? ' selected' : ''}`}
        >
          <span className="exam-q-opt-letter">{option.letter}</span>
          <span className="exam-q-opt-text" dangerouslySetInnerHTML={{ __html: option.html }} />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function ExamTextResponse({
  type,
  readOnly,
  savedAnswer,
  answerLabel,
  placeholder,
  index,
  onTextChange,
}: {
  type: 'fill-blank' | 'short-answer';
  readOnly: boolean;
  savedAnswer?: string | number | null;
  answerLabel: string;
  placeholder?: string;
  index: number;
  onTextChange: (index: number, value: string) => void;
}) {
  const value = typeof savedAnswer === 'string' ? savedAnswer : '';
  if (type === 'fill-blank') {
    if (readOnly) return <div className="exam-q-fill-display">{value}</div>;
    return (
      <Input
        className="exam-q-fill-input"
        name={`examAnswer${index}`}
        aria-label={answerLabel}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onTextChange(index, event.target.value)}
      />
    );
  }
  if (readOnly) return <div className="exam-q-fill-display exam-q-fill-display-multiline">{value}</div>;
  return (
    <Textarea
      className="exam-q-fill-input min-h-20 resize-y"
      name={`examAnswer${index}`}
      aria-label={answerLabel}
      value={value}
      placeholder={placeholder}
      rows={3}
      onChange={(event) => onTextChange(index, event.target.value)}
    />
  );
}

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
  readOnly = false,
  onOptionChange,
  onTextChange,
}: ExamQuestionCardProps) {
  const selected = savedAnswer == null ? '' : String(savedAnswer);

  return (
    <>
      <div className="exam-q-num">
        {questionLabel} {index + 1} / {total}
        <span className="exam-q-type">{typeLabel}</span>
      </div>
      <div className={`exam-q-text${type === 'error' ? ' exam-q-error' : ''}`} dangerouslySetInnerHTML={{ __html: questionHtml }} />
      {type === 'multiple-choice' && options.length > 0 && (
        <ExamChoiceOptions
          options={options}
          selected={selected}
          readOnly={readOnly}
          answerLabel={answerLabel}
          index={index}
          onOptionChange={onOptionChange}
        />
      )}
      {(type === 'fill-blank' || type === 'short-answer') && (
        <ExamTextResponse
          type={type}
          readOnly={readOnly}
          savedAnswer={savedAnswer}
          answerLabel={answerLabel}
          placeholder={placeholder}
          index={index}
          onTextChange={onTextChange}
        />
      )}
    </>
  );
}

export { ExamQuestionCard };

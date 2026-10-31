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
  const groupValue = savedAnswer == null ? [] : [selected];

  return (
    <>
      <div className="exam-q-num">
        {questionLabel} {index + 1} / {total}
        <span className="exam-q-type">{typeLabel}</span>
      </div>
      <div className={`exam-q-text${type === 'error' ? ' exam-q-error' : ''}`} dangerouslySetInnerHTML={{ __html: questionHtml }} />
      {type === 'multiple-choice' && options.length > 0 && (
        <>
          {readOnly ? (
            <div className="exam-q-opts">
              {options.map((option, optionIndex) => (
                <div key={`${option.letter}-${optionIndex}`} className={`exam-q-opt${selected === String(optionIndex) ? ' selected' : ''}`}>
                  <span className="exam-q-opt-letter">{option.letter}</span>
                  <span className="exam-q-opt-text" dangerouslySetInnerHTML={{ __html: option.html }} />
                  {selected === String(optionIndex) && <span className="exam-q-opt-check">✓</span>}
                </div>
              ))}
            </div>
          ) : (
            <ToggleGroup value={groupValue} variant="outline" size="lg" spacing={2} className="exam-q-opts" aria-label={answerLabel} onValueChange={(values) => {
              const next = values[values.length - 1];
              if (next !== undefined) onOptionChange(index, Number(next));
            }}>
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
          )}
        </>
      )}
      {type === 'fill-blank' && (readOnly ? (
        <div className="exam-q-fill-display">{typeof savedAnswer === 'string' ? savedAnswer : ''}</div>
      ) : (
        <Input
          className="exam-q-fill-input"
          name={`examAnswer${index}`}
          aria-label={answerLabel}
          value={typeof savedAnswer === 'string' ? savedAnswer : ''}
          placeholder={placeholder}
          onChange={(event) => onTextChange(index, event.target.value)}
        />
      ))}
      {type === 'short-answer' && (readOnly ? (
        <div className="exam-q-fill-display exam-q-fill-display-multiline">{typeof savedAnswer === 'string' ? savedAnswer : ''}</div>
      ) : (
        <Textarea
          className="exam-q-fill-input min-h-20 resize-y"
          name={`examAnswer${index}`}
          aria-label={answerLabel}
          value={typeof savedAnswer === 'string' ? savedAnswer : ''}
          placeholder={placeholder}
          rows={3}
          onChange={(event) => onTextChange(index, event.target.value)}
        />
      ))}
    </>
  );
}

export { ExamQuestionCard };

import { Badge } from '../ui/shadcn/badge';
import { Card, CardContent, CardHeader } from '../ui/shadcn/card';
import { Input } from '../ui/shadcn/input';
import { Textarea } from '../ui/shadcn/textarea';

export type ExamResultOption = {
  letter: string;
  html: string;
  isCorrect: boolean;
  isSelected: boolean;
};

export type ExamResultQuestion = {
  type: 'multiple-choice' | 'fill-blank' | 'short-answer';
  typeLabel: string;
  questionLabel: string;
  questionHtml: string;
  answer: string;
  options: ExamResultOption[];
  isCorrect: boolean;
  statusLabel: string;
  expectedLabel: string;
  expectedAnswer: string;
  explanationLabel: string;
  explanationHtml: string;
};

export type ExamResultsSnapshot = {
  correct: number;
  total: number;
  percent: number;
  correctLabel: string;
  questions: ExamResultQuestion[];
};

function ExamResults({ snapshot }: { snapshot: ExamResultsSnapshot }) {
  return (
    <div className="exam-results">
      <Card className="exam-score-card">
        <CardHeader className="exam-score-header">
          <div className="exam-score-val">
            <span className="score-correct">{snapshot.correct}</span>
            <span className="score-total">/ {snapshot.total}</span>
          </div>
          <div className="exam-score-lbl">{snapshot.percent}% {snapshot.correctLabel}</div>
        </CardHeader>
      </Card>
      {snapshot.questions.map((question, index) => (
        <article className="exam-q-card exam-result-card" key={`${index}-${question.type}`}>
          <Card className="exam-result-surface">
            <CardHeader className="exam-result-header">
              <div className="exam-q-num">
                {question.questionLabel} {index + 1}
                <Badge variant={question.isCorrect ? 'secondary' : 'destructive'} className="exam-result-badge">
                  {question.statusLabel}
                </Badge>
                <span className="exam-q-type">{question.typeLabel}</span>
              </div>
              <div className="exam-q-text" dangerouslySetInnerHTML={{ __html: question.questionHtml }} />
            </CardHeader>
            <CardContent className="exam-result-content">
              {question.type === 'multiple-choice' && (
                <div className="exam-q-opts exam-result-options">
                  {question.options.map((option, optionIndex) => (
                    <div
                      className={`exam-q-opt${option.isCorrect ? ' correct' : ''}${option.isSelected && !option.isCorrect ? ' wrong' : ''}${option.isSelected ? ' selected' : ''}`}
                      key={`${option.letter}-${optionIndex}`}
                    >
                      <span className="exam-q-opt-letter">{option.letter}</span>
                      <span className="exam-q-opt-text" dangerouslySetInnerHTML={{ __html: option.html }} />
                    </div>
                  ))}
                </div>
              )}
              {question.type === 'fill-blank' && (
                <Input
                  className={`exam-q-fill-input${question.isCorrect ? ' correct' : ' wrong'}`}
                  value={question.answer}
                  readOnly
                  aria-label={question.questionLabel}
                />
              )}
              {question.type === 'short-answer' && (
                <Textarea
                  className={`exam-q-fill-input${question.isCorrect ? ' correct' : ' wrong'}`}
                  value={question.answer}
                  readOnly
                  rows={2}
                  aria-label={question.questionLabel}
                />
              )}
              {!question.isCorrect && question.expectedAnswer && question.type !== 'multiple-choice' && (
                <div className="exam-expected-answer">
                  <span className="label">{question.expectedLabel}:</span> {question.expectedAnswer}
                </div>
              )}
              {question.explanationHtml && (
                <div className="exam-q-result">
                  <span className="label">{question.explanationLabel}:</span>
                  <div className="explain" dangerouslySetInnerHTML={{ __html: question.explanationHtml }} />
                </div>
              )}
            </CardContent>
          </Card>
        </article>
      ))}
    </div>
  );
}

export { ExamResults };

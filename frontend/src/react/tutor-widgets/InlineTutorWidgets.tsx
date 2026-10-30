import { useRef, useState, type FormEvent } from 'react';
import { Button, buttonVariants } from '../ui/shadcn/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/shadcn/collapsible';
import { Card } from '../ui/shadcn/card';
import { Field, FieldGroup } from '../ui/shadcn/field';
import { Textarea } from '../ui/shadcn/textarea';
import { ToggleGroup, ToggleGroupItem } from '../ui/shadcn/toggle-group';
import type { ParsedQuiz } from '../../render/widgetParsers';

type Translatable = (key: string) => string;
type HtmlContent = { html: string; className: string };

function HtmlContent({ html, className, hidden }: HtmlContent & { hidden?: boolean }) {
  return <div className={className} hidden={hidden} dangerouslySetInnerHTML={{ __html: html }} />;
}

function ExampleWidget({ title, problem, solution, t, parsed }: {
  title: string;
  problem: string;
  solution: string;
  t: Translatable;
  parsed: { _revealed?: boolean };
}) {
  const [revealed, setRevealed] = useState(Boolean(parsed._revealed));
  return (
    <Card className="inline-example gap-0 p-3">
      {title && <HtmlContent html={title} className="inline-example-title" />}
      {problem && <HtmlContent html={problem} className="inline-example-problem" />}
      {solution && (
        <>
          <Button variant="outline" size="sm" className="inline-example-reveal mt-2 self-start" onClick={() => {
            const next = !revealed;
            parsed._revealed = next;
            setRevealed(next);
          }}>
            {t(revealed ? 'tutor.hideSolution' : 'tutor.showSolution')}
          </Button>
          <div className="inline-example-solution" hidden={!revealed} dangerouslySetInnerHTML={{ __html: solution }} />
        </>
      )}
    </Card>
  );
}

function TheoremWidget({ title, statement, proofTitle, proofBody, t }: {
  title: string;
  statement: string;
  proofTitle: string;
  proofBody: string;
  t: Translatable;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="inline-theorem gap-2 p-3">
      {title && <HtmlContent html={title} className="inline-theorem-title" />}
      {statement && <HtmlContent html={statement} className="inline-theorem-statement" />}
      {proofBody && (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'inline-theorem-proof-toggle mt-1' })}>
            {t(open ? 'tutor.hideProof' : 'tutor.showProof')}
          </CollapsibleTrigger>
          <CollapsibleContent className="inline-theorem-proof">
            <div className="ui-collapse-inner">
              {proofTitle && <HtmlContent html={proofTitle} className="inline-proof-title" />}
              <HtmlContent html={proofBody} className="inline-proof-body" />
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </Card>
  );
}

function FlashcardWidget({ front, back, label }: { front: string; back: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="inline-flashcard gap-0 p-3" data-slot="collapsible-card">
      <Collapsible open={open} onOpenChange={setOpen}>
        {!open && (
          <CollapsibleTrigger className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'inline-flashcard-front h-auto w-full justify-start whitespace-normal px-2 py-1 text-left' })} aria-label={label}>
            <span dangerouslySetInnerHTML={{ __html: front }} />
          </CollapsibleTrigger>
        )}
        <CollapsibleContent className="inline-flashcard-back">
          <CollapsibleTrigger className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'inline-flashcard-back-trigger h-auto w-full justify-start whitespace-normal px-2 py-1 text-left' })} aria-label={label}>
            <span dangerouslySetInnerHTML={{ __html: back }} />
          </CollapsibleTrigger>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

type PracticeFeedback = { state: '' | 'bad' | 'recorded' | 'ok'; text: string; html?: string };

function normalizePracticeAnswer(value: string) {
  return value.toLowerCase().replace(/[\s.,;:!?()[\]'"]+/g, '').trim();
}

function PracticeWidget({ problem, hint, correct, t, formatMsg, submitChatMessage, stateStore, recordMistake, slotId }: {
  problem: string;
  hint: string;
  correct: string;
  t: Translatable;
  formatMsg: (value: string) => string;
  submitChatMessage?: (text: string, options: { origin: string }) => void;
  stateStore: typeof import('../../state/store').stateStore;
  recordMistake?: (entry: Record<string, unknown>) => void;
  slotId?: string | null;
}) {
  const answerRef = useRef<HTMLTextAreaElement>(null);
  const [hintOpen, setHintOpen] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [feedback, setFeedback] = useState<PracticeFeedback>({ state: '', text: '' });

  function revealAnswer() {
    setDisabled(true);
    setFeedback({ state: 'recorded', text: '', html: formatMsg(correct) });
  }

  function submitAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitted = answerRef.current?.value.trim() || '';
    if (!submitted) {
      setFeedback({ state: 'bad', text: t('tutor.practiceEmpty') });
      return;
    }
    setDisabled(true);
    submitChatMessage?.(t('tutor.practicePrefix') + submitted, { origin: 'practice' });
    if (!correct) {
      setFeedback({ state: 'recorded', text: t('tutor.practiceSent') });
      return;
    }
    const isCorrect = normalizePracticeAnswer(submitted) === normalizePracticeAnswer(correct);
    setFeedback({
      state: isCorrect ? 'ok' : 'bad',
      text: isCorrect ? t('tutor.practiceSelfCorrect') : `${t('tutor.practiceSelfWrong')} ${correct}`,
    });
    if (isCorrect) {
      stateStore.dispatch?.({ type: 'state/set', key: 'practiceAttempts', value: 0 });
    } else {
      recordMistake?.({ type: 'practice', q: problem, options: [], correct, userAnswer: submitted, judgedAnswer: correct, practiceSlotId: slotId || null });
    }
  }

  return (
    <Card className="inline-practice gap-2 p-3">
      <HtmlContent html={formatMsg(problem)} className="inline-practice-problem" />
      {hint && (
        <>
          <Button variant="ghost" size="sm" className="inline-practice-hint-toggle mt-1 self-start" onClick={() => setHintOpen(!hintOpen)}>
            {t(hintOpen ? 'tutor.hideHint' : 'tutor.showHint')}
          </Button>
          <HtmlContent html={formatMsg(hint)} className="inline-practice-hint" hidden={!hintOpen} />
        </>
      )}
      <form className="inline-practice-form" onSubmit={submitAnswer}>
        <FieldGroup className="gap-0">
          <Field>
            <Textarea
              ref={answerRef}
              className="inline-practice-textarea"
              rows={3}
              placeholder={t('tutor.practicePlaceholder')}
              disabled={disabled}
              aria-label={t('tutor.practicePlaceholder')}
            />
          </Field>
        </FieldGroup>
        <div className="inline-practice-actions">
          {correct && (
            <Button variant="outline" size="sm" className="inline-practice-reveal" type="button" onClick={revealAnswer} disabled={disabled}>
              {t('tutor.revealAnswer')}
            </Button>
          )}
          <Button size="sm" className="inline-practice-submit" type="submit" disabled={disabled}>
            {t('tutor.submitAnswer')}
          </Button>
        </div>
        <div className={`inline-practice-feedback${feedback.state ? ` ${feedback.state}` : ''}`} role="status" aria-live="polite">
          {feedback.html ? <span dangerouslySetInnerHTML={{ __html: feedback.html }} /> : feedback.text}
        </div>
      </form>
    </Card>
  );
}

type QuizResult = {
  picked: string;
  feedbackText: string;
  feedbackClass: string;
};

function QuizWidget({ question, options, correct, handleQuizPick, parsed, questionLabel }: {
  question: string;
  options: Array<{ letter: string; text: string; html: string }>;
  correct: string;
  handleQuizPick?: (card: HTMLDivElement, options: HTMLDivElement, feedback: HTMLDivElement, buttons: HTMLButtonElement[], picked: { letter: string; text: string; html: string }, parsed: ParsedQuiz) => void;
  parsed: ParsedQuiz;
  questionLabel: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const [result, setResult] = useState<QuizResult | null>(null);

  function onValueChange(values: string[]) {
    const pickedLetter = values[values.length - 1];
    if (!pickedLetter || result || !handleQuizPick) return;
    const picked = options.find((option) => option.letter === pickedLetter);
    const card = cardRef.current;
    const optionsElement = card?.querySelector<HTMLDivElement>('.inline-quiz-opts');
    if (!picked || !card || !optionsElement || !feedbackRef.current) return;
    const buttons = Array.from(buttonRefs.current.values());
    handleQuizPick(card, optionsElement, feedbackRef.current, buttons, picked, parsed);
    setResult({
      picked: pickedLetter,
      feedbackText: feedbackRef.current.textContent || '',
      feedbackClass: feedbackRef.current.className,
    });
  }

  return (
    <Card className="inline-quiz gap-2 p-3" ref={cardRef}>
      <HtmlContent html={question} className="inline-quiz-q" />
      <ToggleGroup
        value={result ? [result.picked] : []}
        variant="outline"
        size="default"
        spacing={2}
        orientation="vertical"
        className="inline-quiz-opts w-full"
        aria-label={questionLabel}
        onValueChange={onValueChange}
      >
        {options.map((option) => {
          const isPicked = result?.picked === option.letter;
          const isRight = Boolean(correct) && option.letter === correct;
          const isWrong = isPicked && Boolean(correct) && option.letter !== correct;
          const className = `inline-quiz-opt${isPicked ? ' selected' : ''}${isRight && result ? ' correct' : ''}${isWrong ? ' wrong' : ''}`;
          return (
            <ToggleGroupItem
              key={option.letter}
              value={option.letter}
              className={className}
              data-letter={option.letter}
              disabled={Boolean(result)}
              ref={(node) => { if (node) buttonRefs.current.set(option.letter, node); }}
            >
              <span className="inline-quiz-opt-letter">{option.letter}.</span>
              <span className="inline-quiz-opt-text" dangerouslySetInnerHTML={{ __html: option.html }} />
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
      <div className={result?.feedbackClass || 'inline-quiz-feedback'} role="status" aria-live="polite" ref={feedbackRef}>
        {result?.feedbackText || ''}
      </div>
    </Card>
  );
}

export { ExampleWidget, TheoremWidget, FlashcardWidget, PracticeWidget, QuizWidget };

/** Question list: one card per question, answered in place. */
import { memo } from 'react';
import { examAnswerValue, type ExamAnswers, type ExamQuestion } from '@socrates/core';
import { dataAttributes } from '../domProps';
import { R, S, insetRing } from '../look';
import { UiText } from '../primitives/UiText';
import { useUiTheme } from '../primitives/theme';
import { ExamAnswerDisplay, ExamAnswerField, ExamChoiceRow } from './controls';
import type { ExamIds, RenderExamText } from './model';
import type { ExamStrings } from './strings';

const QuestionCard = memo(function QuestionCard({
  question,
  order,
  total,
  value,
  readOnly,
  strings,
  renderText,
  onAnswer,
  idPrefix,
}: {
  question: ExamQuestion;
  order: number;
  total: number;
  value: string | number | undefined;
  readOnly: boolean;
  strings: ExamStrings;
  renderText: RenderExamText;
  onAnswer?(index: number, value: string | number): void;
  idPrefix: string;
}) {
  const { colors } = useUiTheme();
  const selected = examAnswerValue(question, value);
  const selectedIndex = typeof selected === 'number' ? selected : undefined;
  const answerText =
    typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
  const answerLabel = strings.questions.answerLabel(order + 1);

  return (
    <div
      id={`${idPrefix}${question.index}`}
      {...dataAttributes({ examQ: question.index })}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: S[100],
        padding: S[200],
        borderRadius: R.card,
        backgroundColor: colors.card,
        boxShadow: insetRing(colors.hairlineStrong),
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: S[75],
        }}
      >
        <UiText variant="labelSm" tone="secondary" {...dataAttributes({ examQNum: 1 })}>
          {strings.questions.number(order + 1, total)}
        </UiText>
        <UiText variant="labelSm" tone="tertiary" {...dataAttributes({ examQType: 1 })}>
          {strings.questions.type[question.type]}
        </UiText>
      </div>

      <div {...dataAttributes({ examQText: 1 })}>{renderText(question.prompt, 'exam-q')}</div>

      {question.type === 'multiple-choice' ? (
        <div
          role="radiogroup"
          aria-label={answerLabel}
          style={{ display: 'flex', flexDirection: 'column', gap: S[50] }}
        >
          {question.options.map((option, optionIndex) => {
            const isSelected = selectedIndex === optionIndex;
            const isCorrect = option.letter === question.answer;
            return (
              <ExamChoiceRow
                key={`${option.letter}-${optionIndex}`}
                letter={option.letter}
                selected={isSelected}
                disabled={readOnly}
                verdict={
                  readOnly ? (isCorrect ? 'correct' : isSelected ? 'wrong' : undefined) : undefined
                }
                onPress={readOnly ? undefined : () => onAnswer?.(question.index, optionIndex)}
              >
                {renderText(option.text, 'exam-option')}
              </ExamChoiceRow>
            );
          })}
        </div>
      ) : readOnly ? (
        <ExamAnswerDisplay value={answerText} data={{ examAnswerDisplay: question.index }} />
      ) : (
        <ExamAnswerField
          label={answerLabel}
          value={answerText}
          placeholder={strings.questions.answerPlaceholder}
          multiline={question.type === 'short-answer'}
          data={{ examAnswer: question.index }}
          onChange={(text) => onAnswer?.(question.index, text)}
        />
      )}
    </div>
  );
});

export function ExamQuestionList({
  questions,
  answers,
  readOnly,
  strings,
  ids,
  renderText,
  onAnswer,
}: {
  questions: ExamQuestion[];
  answers: ExamAnswers;
  readOnly: boolean;
  strings: ExamStrings;
  ids?: ExamIds;
  renderText: RenderExamText;
  onAnswer?(index: number, value: string | number): void;
}) {
  const idPrefix = ids?.questionCardPrefix ?? 'examQ';
  return (
    <div
      id={ids?.questionsContainer}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        maxWidth: 720,
        alignSelf: 'center',
        gap: S[200],
      }}
    >
      {questions.map((question, order) => (
        <QuestionCard
          key={question.index}
          question={question}
          order={order}
          total={questions.length}
          value={answers[question.index]}
          readOnly={readOnly}
          strings={strings}
          renderText={renderText}
          onAnswer={onAnswer}
          idPrefix={idPrefix}
        />
      ))}
    </div>
  );
}

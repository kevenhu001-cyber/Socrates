/** Graded results: score card plus one row per question. */
import type { ExamResults as ExamResultsData } from '@socrates/core';
import { dataAttributes } from '../domProps';
import { VerdictGlyph } from '../learn/parts';
import { R, S, insetRing } from '../look';
import { UiText } from '../primitives/UiText';
import { useUiTheme } from '../primitives/theme';
import { ExamAnswerDisplay, ExamChoiceRow } from './controls';
import type { RenderExamText } from './model';

export function ExamResults({
  results,
  renderText,
}: {
  results: ExamResultsData;
  renderText: RenderExamText;
}) {
  const { colors } = useUiTheme();
  const card = {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: S[100],
    padding: S[200],
    borderRadius: R.card,
    backgroundColor: colors.card,
    boxShadow: insetRing(colors.hairlineStrong),
  };

  return (
    <div
      {...dataAttributes({ examResults: 1 })}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        maxWidth: 720,
        alignSelf: 'center',
        gap: S[200],
      }}
    >
      <div
        {...dataAttributes({ examScore: 1 })}
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'baseline',
          gap: S[75],
          padding: S[300],
          borderRadius: R.card,
          backgroundColor: colors.subtle,
        }}
      >
        <UiText variant="display">{String(results.correct)}</UiText>
        <UiText variant="titleSm" tone="tertiary">
          / {results.total}
        </UiText>
        <div style={{ flex: 1 }} />
        <UiText variant="bodySm" tone="secondary">
          {results.percent}% {results.correctLabel}
        </UiText>
      </div>

      {results.questions.map((question, index) => (
        <div
          key={`${index}-${question.type}`}
          {...dataAttributes({ examResultCard: index })}
          style={card}
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
              {question.questionLabel} {index + 1}
            </UiText>
            <VerdictGlyph verdict={question.isCorrect ? 'correct' : 'incorrect'} size={16} />
            <UiText variant="labelSm" tone="secondary">
              {question.statusLabel}
            </UiText>
            <UiText variant="labelSm" tone="tertiary" {...dataAttributes({ examQType: 1 })}>
              {question.typeLabel}
            </UiText>
          </div>

          <div {...dataAttributes({ examQText: 1 })}>
            {renderText(question.questionText, 'exam-q')}
          </div>

          {question.options.length ? (
            <div role="group" style={{ display: 'flex', flexDirection: 'column', gap: S[50] }}>
              {question.options.map((option, optionIndex) => (
                <ExamChoiceRow
                  key={`${option.letter}-${optionIndex}`}
                  letter={option.letter}
                  selected={option.isSelected}
                  disabled
                  verdict={option.isCorrect ? 'correct' : option.isSelected ? 'wrong' : undefined}
                >
                  {renderText(option.text, 'exam-option')}
                </ExamChoiceRow>
              ))}
            </div>
          ) : null}

          {question.type !== 'multiple-choice' ? (
            <ExamAnswerDisplay value={question.answer} data={{ examAnswerDisplay: index }} />
          ) : null}

          {!question.isCorrect && question.expectedAnswer && question.type !== 'multiple-choice' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <UiText variant="labelSm" tone="tertiary">
                {question.expectedLabel}
              </UiText>
              <div>{renderText(question.expectedAnswer, 'exam-expected')}</div>
            </div>
          ) : null}

          {question.explanationText ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <UiText variant="labelSm" tone="tertiary">
                {question.explanationLabel}
              </UiText>
              <div>{renderText(question.explanationText, 'exam-explain')}</div>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

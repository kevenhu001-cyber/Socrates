/** Graded results: score card plus one row per question. */
import { View } from 'react-native';
import type { ExamResults as ExamResultsData } from '../examModel';
import { VerdictGlyph, dataSet } from '../learn/parts';
import { R, S, insetRing } from '../look';
import { UiText } from '../primitives/UiText';
import { useUiTheme } from '../primitives/theme';
import { ExamAnswerDisplay, ExamChoiceRow } from './controls';
import type { RenderExamText } from './model';

export function ExamResults({ results, renderText }: {
  results: ExamResultsData;
  renderText: RenderExamText;
}) {
  const { colors } = useUiTheme();
  const card = {
    gap: S[100],
    padding: S[200],
    borderRadius: R.card,
    backgroundColor: colors.card,
    boxShadow: insetRing(colors.hairlineStrong),
  };

  return (
    <View {...dataSet({ examResults: 1 })} style={{ width: '100%', maxWidth: 720, alignSelf: 'center', gap: S[200] }}>
      <View
        {...dataSet({ examScore: 1 })}
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          gap: S[75],
          padding: S[300],
          borderRadius: R.card,
          backgroundColor: colors.subtle,
        }}
      >
        <UiText variant="display">{String(results.correct)}</UiText>
        <UiText variant="titleSm" tone="tertiary">/ {results.total}</UiText>
        <View style={{ flex: 1 }} />
        <UiText variant="bodySm" tone="secondary">{results.percent}% {results.correctLabel}</UiText>
      </View>

      {results.questions.map((question, index) => (
        <View key={`${index}-${question.type}`} {...dataSet({ examResultCard: index })} style={card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: S[75] }}>
            <UiText variant="labelSm" tone="secondary" {...dataSet({ examQNum: 1 })}>
              {question.questionLabel} {index + 1}
            </UiText>
            <VerdictGlyph verdict={question.isCorrect ? 'correct' : 'incorrect'} size={16} />
            <UiText variant="labelSm" tone="secondary">{question.statusLabel}</UiText>
            <UiText variant="labelSm" tone="tertiary" {...dataSet({ examQType: 1 })}>{question.typeLabel}</UiText>
          </View>

          <View {...dataSet({ examQText: 1 })}>{renderText(question.questionText, 'exam-q')}</View>

          {question.options.length ? (
            <View role="group" style={{ gap: S[50] }}>
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
            </View>
          ) : null}

          {question.type !== 'multiple-choice' ? (
            <ExamAnswerDisplay value={question.answer} data={{ examAnswerDisplay: index }} />
          ) : null}

          {!question.isCorrect && question.expectedAnswer && question.type !== 'multiple-choice' ? (
            <View style={{ gap: 2 }}>
              <UiText variant="labelSm" tone="tertiary">{question.expectedLabel}</UiText>
              <View>{renderText(question.expectedAnswer, 'exam-expected')}</View>
            </View>
          ) : null}

          {question.explanationText ? (
            <View style={{ gap: 2 }}>
              <UiText variant="labelSm" tone="tertiary">{question.explanationLabel}</UiText>
              <View>{renderText(question.explanationText, 'exam-explain')}</View>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/**
 * RN-5 mistake book: filter capsules, topic groups and one card per wrong
 * answer. A card names the question and, expanded, where the answer went
 * wrong and the keyed answer. "Redo" hands the id back to the host, which
 * re-mounts the question (the existing redo flow).
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { dataAttributes } from '../domProps';
import { R, S, focusRing, insetRing, shadow, sheets, transition } from '../look';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { usePressFeedback } from '../primitives/UiButton';
import { Chevron, useReducedMotion } from '../turn/parts';
import { PillAction, VerdictGlyph } from '../learn/parts';
import {
  filterMistakeViews,
  groupMistakesByTopic,
  mistakeEmptyKind,
  mistakeView,
  normalizeMistakeFilter,
  type MistakeFilterValue,
  type MistakeRowInput,
  type MistakeView,
} from './model';
import { defaultMistakeStrings, fill, type MistakeStrings } from './strings';

export interface MistakeBookProps {
  mistakes: readonly MistakeRowInput[];
  filter: string;
  strings?: MistakeStrings;
  onFilter: (value: MistakeFilterValue) => void;
  onRedo: (id: string) => void;
  /** RN-6: ask the model for a follow-up question built on this mistake. */
  onNextQuestion?: (id: string) => void;
  /** RN-6: the mistake whose next question is being written, if any. */
  pendingNextId?: string | null;
  /**
   * Host typesetting for the question and option text (web: `$…$` through
   * KaTeX). Its result sits inside a UiText, so it inherits font, colour and
   * line clamp. Absent: the plain text.
   */
  renderText?: (text: string, part: string) => ReactNode;
}

const plainText = (text: string): ReactNode => text;

const BUTTON_RESET: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  background: 'none',
  border: 0,
  padding: 0,
  margin: 0,
  font: 'inherit',
  color: 'inherit',
  textAlign: 'inherit',
};

export function MistakeBook({
  mistakes,
  filter: rawFilter,
  strings = defaultMistakeStrings,
  onFilter,
  onRedo,
  onNextQuestion,
  pendingNextId,
  renderText = plainText,
}: MistakeBookProps) {
  const filter = normalizeMistakeFilter(rawFilter);
  const rows = mistakes.map(mistakeView);
  const visible = filterMistakeViews(rows, filter);
  const empty = mistakeEmptyKind(rows.length, visible.length, filter);
  const groups = groupMistakesByTopic(visible);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const { colors } = useUiTheme();
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: S[100] }}
      {...dataAttributes({ mistakeBook: '1' })}
    >
      <div
        role="radiogroup"
        aria-label={strings.filterLabel}
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignSelf: 'flex-start',
          gap: 2,
          padding: 3,
          borderRadius: R.pill,
          backgroundColor: colors.fill,
        }}
        {...dataAttributes({ mistakeFilter: filter })}
      >
        {(['all', 'unresolved', 'resolved'] as const).map((value) => (
          <FilterPill
            key={value}
            value={value}
            label={strings.filter[value]}
            selected={filter === value}
            onPress={() => onFilter(value)}
          />
        ))}
      </div>
      <UiText
        variant="labelSm"
        tone="secondary"
        role="heading"
        aria-level={3}
        style={{ marginTop: S[50] }}
      >
        {strings.title}
      </UiText>
      {empty ? (
        <div
          {...dataAttributes({ mistakeEmpty: empty })}
          style={{
            display: 'flex',
            flexDirection: 'column',
            paddingBlock: S[300],
            paddingInline: S[200],
            gap: S[50],
            borderRadius: R.card,
            backgroundColor: sheets(colors).subtle,
            boxShadow: insetRing(colors.hairline),
          }}
        >
          <UiText variant="bodySm" tone="secondary" align="center">
            {empty === 'empty'
              ? strings.empty
              : empty === 'filterResolved'
                ? strings.filterEmptyResolved
                : strings.filterEmptyOther}
          </UiText>
          {empty === 'empty' ? (
            <UiText variant="labelSm" tone="tertiary" align="center" style={{ fontWeight: '400' }}>
              {strings.emptyHint}
            </UiText>
          ) : null}
        </div>
      ) : (
        groups.map((group) => (
          <div
            key={group.topic || '__none'}
            role="group"
            aria-label={group.topic || strings.untitledTopic}
            style={{ display: 'flex', flexDirection: 'column', gap: S[75] }}
            {...dataAttributes({ mistakeGroup: group.topic || '-' })}
          >
            {groups.length > 1 ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  paddingInline: S[50],
                  paddingTop: S[50],
                }}
              >
                <UiText variant="labelSm" tone="tertiary">
                  {group.topic || strings.untitledTopic}
                </UiText>
                <UiText variant="labelSm" tone="tertiary" style={{ fontVariant: ['tabular-nums'] }}>
                  {String(group.items.length)}
                </UiText>
              </div>
            ) : null}
            {group.items.map((row) => (
              <MistakeCard
                key={row.id}
                row={row}
                strings={strings}
                expanded={open[row.id] === true}
                onToggle={() => setOpen((current) => ({ ...current, [row.id]: !current[row.id] }))}
                onRedo={() => onRedo(row.id)}
                onNextQuestion={onNextQuestion ? () => onNextQuestion(row.id) : undefined}
                nextPending={pendingNextId === row.id}
                renderText={renderText}
              />
            ))}
          </div>
        ))
      )}
    </div>
  );
}

/** Site `.ui-seg` segment: quiet text on the grey track, a white lifted capsule when chosen. */
function FilterPill({
  value,
  label,
  selected,
  onPress,
}: {
  value: string;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useUiTheme();
  const reduced = useReducedMotion();
  const { hovered, focused, handlers } = usePressFeedback();
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onPress}
      {...handlers}
      {...dataAttributes({ v: value })}
      style={{
        ...BUTTON_RESET,
        flexDirection: 'row',
        height: 28,
        paddingInline: S[100],
        borderRadius: R.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: selected ? colors.card : hovered ? colors.fillHover : 'transparent',
        boxShadow: selected ? `0 0 0 1px ${colors.hairline}, 0 1px 2px rgb(0 0 0 / 4%)` : undefined,
        ...focusRing(colors, focused),
        ...transition('background-color, box-shadow', reduced),
      }}
    >
      <UiText variant="labelSm" tone={selected ? 'ink' : 'secondary'} numberOfLines={1}>
        {label}
      </UiText>
    </button>
  );
}

/** One line of the analysis on a tinted sheet; `strong` is the keyed answer / right way (ink ring). */
function AnswerLine({
  label,
  value,
  strong,
  data,
  renderText = plainText,
}: {
  label: string;
  value: string;
  strong?: boolean;
  data: Record<string, string>;
  renderText?: (text: string, part: string) => ReactNode;
}) {
  const { colors } = useUiTheme();
  const { subtle } = sheets(colors);
  return (
    <div
      {...dataAttributes(data)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: S[50],
        paddingInline: S[100],
        paddingBlock: S[75] + 2,
        borderRadius: R.row,
        backgroundColor: strong ? colors.card : subtle,
        boxShadow: insetRing(strong ? colors.ink : colors.hairline, strong ? 1.5 : 1),
      }}
    >
      <UiText variant="labelSm" tone="tertiary">
        {label}
      </UiText>
      <UiText variant="bodySm" tone={strong ? 'ink' : 'secondary'}>
        {renderText(value, 'mistake-answer')}
      </UiText>
    </div>
  );
}

/**
 * Option letter in a 22px disc, as on QuizCard: the letter always stays (ink
 * fill for the key, a hairline ring otherwise) and the verdict moves to the
 * row end as a ✓ / ✕ `VerdictGlyph`.
 */
function OptionMark({ letter, tag }: { letter: string; tag?: string | null }) {
  const { colors } = useUiTheme();
  const right = tag === 'correct';
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-flex',
        width: 22,
        height: 22,
        borderRadius: R.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: right ? colors.ink : colors.card,
        boxShadow: right ? undefined : insetRing(colors.hairlineStrong, 1),
      }}
    >
      <UiText
        variant="labelSm"
        tone={right ? 'onInk' : 'tertiary'}
        style={{ fontVariant: ['tabular-nums'], lineHeight: '22px' }}
      >
        {letter}
      </UiText>
    </span>
  );
}

/**
 * A mistake: a white card on the site lift. The head reads type tag, topic
 * and time, then the question; expanded, the options are marked ✓ / ✕ and
 * the analysis sits on two sheets (where it went wrong / the right way,
 * the latter ringed in ink). Actions live in a hairline-ruled footer.
 */
function MistakeCard({
  row,
  strings,
  expanded,
  onToggle,
  onRedo,
  onNextQuestion,
  nextPending,
  renderText,
}: {
  row: MistakeView;
  strings: MistakeStrings;
  expanded: boolean;
  onToggle: () => void;
  onRedo: () => void;
  onNextQuestion?: () => void;
  nextPending?: boolean;
  renderText: (text: string, part: string) => ReactNode;
}) {
  const { colors } = useUiTheme();
  const reduced = useReducedMotion();
  const { subtle } = sheets(colors);
  const { hovered, focused, handlers } = usePressFeedback();
  const detailId = `mistake-detail-${row.id}`;
  const meta = [strings.typeLabel(row.type), row.topic, strings.time(row.timestamp)].filter(
    Boolean,
  );
  return (
    <div
      role="article"
      aria-label={row.question}
      {...dataAttributes({
        mistakeId: row.id,
        mistakeResolved: row.resolved ? '1' : undefined,
      })}
      style={{
        borderRadius: R.card,
        backgroundColor: colors.card,
        boxShadow: shadow(colors, hovered ? 'overlay' : 'raised'),
        overflow: 'hidden',
        ...transition('box-shadow', reduced, 200),
      }}
    >
      <button
        type="button"
        role="button"
        aria-expanded={expanded}
        aria-controls={detailId}
        aria-label={`${row.question} — ${expanded ? strings.hideDetail : strings.showDetail}`}
        onClick={onToggle}
        {...handlers}
        {...dataAttributes({ mistakeToggle: row.id })}
        style={{
          ...BUTTON_RESET,
          width: '100%',
          paddingInline: S[200],
          paddingTop: S[100] + 2,
          paddingBottom: S[200],
          gap: S[75],
          ...focusRing(colors, focused, -2),
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: S[75] }}>
          {meta[0] ? (
            <span
              {...dataAttributes({ mistakeType: row.type })}
              style={{
                display: 'inline-flex',
                height: 22,
                alignItems: 'center',
                justifyContent: 'center',
                paddingInline: S[75],
                borderRadius: R.pill,
                backgroundColor: colors.fill,
              }}
            >
              <UiText
                variant="labelSm"
                tone="secondary"
                numberOfLines={1}
                style={{ fontWeight: '400' }}
              >
                {meta[0]}
              </UiText>
            </span>
          ) : null}
          <UiText
            variant="labelSm"
            tone="tertiary"
            numberOfLines={1}
            style={{ flex: 1, minWidth: 0, fontWeight: '400' }}
          >
            {meta.slice(1).join(' · ')}
          </UiText>
          {row.resolved ? (
            <span
              {...dataAttributes({ mistakeResolvedTag: '1' })}
              style={{
                display: 'inline-flex',
                height: 22,
                alignItems: 'center',
                justifyContent: 'center',
                paddingInline: S[75],
                borderRadius: R.pill,
                backgroundColor: colors.ink,
              }}
            >
              <UiText variant="labelSm" tone="onInk" numberOfLines={1}>
                {strings.conquered}
              </UiText>
            </span>
          ) : null}
          <Chevron open={expanded} size={6} tone={hovered ? 'ink' : 'tertiary'} />
        </div>
        <UiText
          variant="label"
          numberOfLines={expanded ? undefined : 2}
          {...dataAttributes({ mistakeQ: '1' })}
        >
          {renderText(row.question, 'mistake-q')}
        </UiText>
      </button>
      {expanded ? (
        <div
          id={detailId}
          {...dataAttributes({ mistakeDetail: row.id })}
          style={{
            display: 'flex',
            flexDirection: 'column',
            paddingInline: S[200],
            paddingBottom: S[200],
            gap: S[75],
          }}
        >
          {row.options.length ? (
            <div
              role="list"
              aria-label={strings.options}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: S[50],
                padding: S[100],
                borderRadius: R.row,
                backgroundColor: subtle,
                marginBottom: S[50],
              }}
            >
              {row.options.map((option, index) => (
                <div
                  key={`${option.letter}-${index}`}
                  role="listitem"
                  {...dataAttributes({
                    mistakeOpt: option.letter,
                    mistakeTag: option.tag ?? undefined,
                  })}
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: S[75],
                  }}
                >
                  <OptionMark letter={option.letter} tag={option.tag} />
                  <UiText
                    variant="bodySm"
                    tone={
                      option.tag === 'correct'
                        ? 'ink'
                        : option.tag === 'wrong'
                          ? 'secondary'
                          : 'tertiary'
                    }
                    style={{
                      flex: 1,
                      textDecorationLine: option.tag === 'wrong' ? 'line-through' : 'none',
                    }}
                  >
                    {renderText(option.text, 'mistake-option')}
                  </UiText>
                  {option.tag === 'correct' || option.tag === 'wrong' ? (
                    <span style={{ display: 'inline-flex', paddingTop: 1 }}>
                      <VerdictGlyph verdict={option.tag === 'correct' ? 'correct' : 'incorrect'} />
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
          {row.whyWrong || row.rightWay ? (
            <>
              {/* RN-6: the AI analysis takes the two headline lines; the plain
                  answers stay underneath when there are no options to mark. */}
              {!row.options.length ? (
                <AnswerLine
                  label={strings.answerGiven}
                  value={row.yourAnswer ?? strings.noAnswer}
                  data={{ mistakeGiven: row.id }}
                  renderText={renderText}
                />
              ) : null}
              {!row.options.length && row.correctAnswer ? (
                <AnswerLine
                  label={strings.answerKeyed}
                  value={row.correctAnswer}
                  data={{ mistakeKeyed: row.id }}
                  renderText={renderText}
                />
              ) : null}
              {row.whyWrong ? (
                <AnswerLine
                  label={strings.yourAnswer}
                  value={row.whyWrong}
                  data={{ mistakeCause: row.id, mistakeAi: '1' }}
                  renderText={renderText}
                />
              ) : null}
              {row.rightWay ? (
                <AnswerLine
                  label={strings.correctAnswer}
                  value={row.rightWay}
                  strong
                  data={{ mistakeRight: row.id, mistakeAi: '1' }}
                  renderText={renderText}
                />
              ) : null}
            </>
          ) : (
            <>
              <AnswerLine
                label={strings.yourAnswer}
                value={row.yourAnswer ?? strings.noAnswer}
                data={{ mistakeCause: row.id }}
                renderText={renderText}
              />
              {row.correctAnswer ? (
                <AnswerLine
                  label={strings.correctAnswer}
                  value={row.correctAnswer}
                  strong
                  data={{ mistakeRight: row.id }}
                  renderText={renderText}
                />
              ) : null}
            </>
          )}
        </div>
      ) : null}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: S[75],
          minHeight: 52,
          paddingInline: S[200],
          paddingBlock: S[75] + 2,
          borderTop: `1px solid ${colors.hairline}`,
        }}
      >
        <UiText
          variant="labelSm"
          tone="tertiary"
          style={{ fontWeight: '400', flexShrink: 1 }}
          {...dataAttributes({ mistakeRedoCount: row.redoCount || undefined })}
        >
          {row.redoCount
            ? row.redoCount === 1
              ? strings.redoneOne
              : fill(strings.redoneMany, { n: row.redoCount })
            : ''}
        </UiText>
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
            gap: S[75],
          }}
        >
          {onNextQuestion ? (
            <PillAction
              size="sm"
              label={nextPending ? strings.toNextQuestionBusy : strings.toNextQuestion}
              onPress={onNextQuestion}
              disabled={nextPending}
              data={{ mistakeNext: row.id, mistakeNextBusy: nextPending ? '1' : undefined }}
            />
          ) : null}
          <PillAction
            size="sm"
            tone="solid"
            label={strings.redo}
            onPress={onRedo}
            data={{ redo: row.id }}
          />
        </div>
      </div>
    </div>
  );
}

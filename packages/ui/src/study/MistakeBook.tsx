/**
 * RN-5 mistake book: filter capsules, topic groups and one card per wrong
 * answer. A card names the question and, expanded, where the answer went
 * wrong and the keyed answer. "Redo" hands the id back to the host, which
 * re-mounts the question (the existing redo flow).
 */
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { uiRadius, uiSpace } from '@socrates/theme';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { usePressFeedback } from '../primitives/UiButton';
import { Chevron } from '../turn/parts';
import { PillAction, dataSet } from '../learn/parts';
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
}

export function MistakeBook({ mistakes, filter: rawFilter, strings = defaultMistakeStrings, onFilter, onRedo, onNextQuestion, pendingNextId }: MistakeBookProps) {
  const filter = normalizeMistakeFilter(rawFilter);
  const rows = mistakes.map(mistakeView);
  const visible = filterMistakeViews(rows, filter);
  const empty = mistakeEmptyKind(rows.length, visible.length, filter);
  const groups = groupMistakesByTopic(visible);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <View style={{ gap: uiSpace[3] }} {...dataSet({ mistakeBook: '1' })}>
      <View role="radiogroup" aria-label={strings.filterLabel} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: uiSpace[1] }} {...dataSet({ mistakeFilter: filter })}>
        {(['all', 'unresolved', 'resolved'] as const).map((value) => (
          <FilterPill key={value} value={value} label={strings.filter[value]} selected={filter === value} onPress={() => onFilter(value)} />
        ))}
      </View>
      <UiText variant="labelSm" tone="tertiary" role="heading" aria-level={3}>{strings.title}</UiText>
      {empty ? (
        <View {...dataSet({ mistakeEmpty: empty })} style={{ paddingVertical: uiSpace[5], gap: uiSpace[1] }}>
          <UiText variant="bodySm" tone="secondary" align="center">
            {empty === 'empty' ? strings.empty : empty === 'filterResolved' ? strings.filterEmptyResolved : strings.filterEmptyOther}
          </UiText>
          {empty === 'empty' ? <UiText variant="labelSm" tone="tertiary" align="center" style={{ fontWeight: '400' }}>{strings.emptyHint}</UiText> : null}
        </View>
      ) : groups.map((group) => (
        <View key={group.topic || '__none'} role="group" aria-label={group.topic || strings.untitledTopic} style={{ gap: uiSpace[2] }} {...dataSet({ mistakeGroup: group.topic || '-' })}>
          {groups.length > 1 ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: uiSpace[1] }}>
              <UiText variant="eyebrow" tone="tertiary" style={{ letterSpacing: 0 }}>{group.topic || strings.untitledTopic}</UiText>
              <UiText variant="eyebrow" tone="tertiary" style={{ letterSpacing: 0 }}>{String(group.items.length)}</UiText>
            </View>
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
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function FilterPill({ value, label, selected, onPress }: { value: string; label: string; selected: boolean; onPress: () => void }) {
  const { colors } = useUiTheme();
  const { hovered, focused, handlers } = usePressFeedback();
  return (
    <Pressable
      role="radio"
      aria-checked={selected}
      onPress={onPress}
      {...handlers}
      {...dataSet({ v: value })}
      style={{
        height: 28,
        paddingHorizontal: uiSpace[3],
        borderRadius: uiRadius.pill,
        justifyContent: 'center',
        backgroundColor: selected ? colors.ink : hovered ? colors.fill : 'transparent',
        borderWidth: selected ? 0 : 1,
        borderColor: colors.hairline,
        outlineStyle: focused ? 'solid' : undefined,
        outlineWidth: focused ? 2 : 0,
        outlineColor: colors.ink,
        outlineOffset: 2,
      }}
    >
      <UiText variant="labelSm" tone={selected ? 'onInk' : 'secondary'} numberOfLines={1}>{label}</UiText>
    </Pressable>
  );
}

function AnswerLine({ label, value, strong, data }: { label: string; value: string; strong?: boolean; data: Record<string, string> }) {
  const { colors } = useUiTheme();
  return (
    <View {...dataSet(data)} style={{ gap: 2, paddingLeft: uiSpace[3], borderLeftWidth: strong ? 2 : 1, borderLeftColor: strong ? colors.ink : colors.hairlineStrong }}>
      <UiText variant="eyebrow" tone="tertiary" style={{ letterSpacing: 0 }}>{label}</UiText>
      <UiText variant="bodySm" tone={strong ? 'ink' : 'secondary'}>{value}</UiText>
    </View>
  );
}

function MistakeCard({ row, strings, expanded, onToggle, onRedo, onNextQuestion, nextPending }: { row: MistakeView; strings: MistakeStrings; expanded: boolean; onToggle: () => void; onRedo: () => void; onNextQuestion?: () => void; nextPending?: boolean }) {
  const { colors } = useUiTheme();
  const { hovered, focused, handlers } = usePressFeedback();
  const detailId = `mistake-detail-${row.id}`;
  const meta = [strings.typeLabel(row.type), row.topic, strings.time(row.timestamp)].filter(Boolean);
  return (
    <View
      role="article"
      aria-label={row.question}
      {...dataSet({ mistakeId: row.id, mistakeResolved: row.resolved ? '1' : undefined })}
      style={{ borderRadius: uiRadius.lg, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.card, overflow: 'hidden' }}
    >
      <Pressable
        role="button"
        aria-expanded={expanded}
        aria-controls={detailId}
        aria-label={`${row.question} — ${expanded ? strings.hideDetail : strings.showDetail}`}
        onPress={onToggle}
        {...handlers}
        {...dataSet({ mistakeToggle: row.id })}
        style={{
          padding: uiSpace[3],
          gap: uiSpace[2],
          backgroundColor: hovered ? colors.fill : 'transparent',
          outlineStyle: focused ? 'solid' : undefined,
          outlineWidth: focused ? 2 : 0,
          outlineColor: colors.ink,
          outlineOffset: -2,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: uiSpace[2] }}>
          <UiText variant="eyebrow" tone="tertiary" numberOfLines={1} style={{ flex: 1, minWidth: 0, letterSpacing: 0 }}>
            <UiText variant="eyebrow" tone="secondary" style={{ letterSpacing: 0 }} {...dataSet({ mistakeType: row.type })}>{meta[0] ?? ''}</UiText>
            {meta.length > 1 ? ` · ${meta.slice(1).join(' · ')}` : ''}
          </UiText>
          {row.resolved ? (
            <View {...dataSet({ mistakeResolvedTag: '1' })} style={{ paddingHorizontal: uiSpace[2], paddingVertical: 1, borderRadius: uiRadius.pill, backgroundColor: colors.ink }}>
              <UiText variant="eyebrow" tone="onInk" style={{ letterSpacing: 0 }}>{strings.conquered}</UiText>
            </View>
          ) : null}
          <Chevron open={expanded} size={6} tone="tertiary" />
        </View>
        <UiText variant="label" numberOfLines={expanded ? undefined : 2} {...dataSet({ mistakeQ: '1' })}>{row.question}</UiText>
      </Pressable>
      {expanded ? (
        <View nativeID={detailId} {...dataSet({ mistakeDetail: row.id })} style={{ paddingHorizontal: uiSpace[3], paddingBottom: uiSpace[3], gap: uiSpace[3] }}>
          {row.options.length ? (
            <View role="list" aria-label={strings.options} style={{ gap: uiSpace[1] }}>
              {row.options.map((option, index) => (
                <View key={`${option.letter}-${index}`} role="listitem" {...dataSet({ mistakeOpt: option.letter, mistakeTag: option.tag ?? undefined })} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: uiSpace[2] }}>
                  <View aria-hidden style={{ minWidth: 24, height: 20, paddingHorizontal: 6, borderRadius: uiRadius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: option.tag === 'correct' ? colors.ink : 'transparent', borderWidth: option.tag === 'correct' ? 0 : 1, borderColor: option.tag === 'wrong' ? colors.ink : colors.hairline }}>
                    <UiText variant="eyebrow" tone={option.tag === 'correct' ? 'onInk' : option.tag === 'wrong' ? 'ink' : 'tertiary'} style={{ letterSpacing: 0 }}>{option.letter}</UiText>
                  </View>
                  <UiText variant="bodySm" tone={option.tag ? 'ink' : 'secondary'} style={{ flex: 1, textDecorationLine: option.tag === 'wrong' ? 'line-through' : 'none' }}>
                    {`${option.text}${option.tag === 'correct' ? '  ✓' : option.tag === 'wrong' ? '  ✕' : ''}`}
                  </UiText>
                </View>
              ))}
            </View>
          ) : null}
          {row.whyWrong || row.rightWay ? (
            <>
              {/* RN-6: the AI analysis takes the two headline lines; the plain
                  answers stay underneath when there are no options to mark. */}
              {!row.options.length ? <AnswerLine label={strings.answerGiven} value={row.yourAnswer ?? strings.noAnswer} data={{ mistakeGiven: row.id }} /> : null}
              {!row.options.length && row.correctAnswer ? <AnswerLine label={strings.answerKeyed} value={row.correctAnswer} data={{ mistakeKeyed: row.id }} /> : null}
              {row.whyWrong ? <AnswerLine label={strings.yourAnswer} value={row.whyWrong} data={{ mistakeCause: row.id, mistakeAi: '1' }} /> : null}
              {row.rightWay ? <AnswerLine label={strings.correctAnswer} value={row.rightWay} strong data={{ mistakeRight: row.id, mistakeAi: '1' }} /> : null}
            </>
          ) : (
            <>
              <AnswerLine label={strings.yourAnswer} value={row.yourAnswer ?? strings.noAnswer} data={{ mistakeCause: row.id }} />
              {row.correctAnswer ? <AnswerLine label={strings.correctAnswer} value={row.correctAnswer} strong data={{ mistakeRight: row.id }} /> : null}
            </>
          )}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: uiSpace[2], paddingHorizontal: uiSpace[3], paddingVertical: uiSpace[2], borderTopWidth: 1, borderTopColor: colors.hairline }}>
        <UiText variant="eyebrow" tone="tertiary" style={{ letterSpacing: 0 }} {...dataSet({ mistakeRedoCount: row.redoCount || undefined })}>
          {row.redoCount ? (row.redoCount === 1 ? strings.redoneOne : fill(strings.redoneMany, { n: row.redoCount })) : ''}
        </UiText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: uiSpace[2] }}>
          {onNextQuestion ? (
            <PillAction
              label={nextPending ? strings.toNextQuestionBusy : strings.toNextQuestion}
              onPress={onNextQuestion}
              disabled={nextPending}
              data={{ mistakeNext: row.id, mistakeNextBusy: nextPending ? '1' : undefined }}
            />
          ) : null}
          <PillAction tone="solid" label={strings.redo} onPress={onRedo} data={{ redo: row.id }} />
        </View>
      </View>
    </View>
  );
}

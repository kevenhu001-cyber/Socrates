/**
 * RN-4 — the question chain ("Think out loud").
 *
 * RN-8: drawn on the site's question-chain stage (a #f9f9f9 sheet with a
 * hairline ring, 20px radius). One vertical spine, drawn as a 1px hairline,
 * with numbered capsule nodes (never dots). From top to bottom:
 *   - walked questions, folded to the root and the last step when long;
 *   - the current question, its node filled in ink;
 *   - the questions the learner can follow next, as hairline capsules whose
 *     nodes are outlined and carry the number the step would get.
 *
 * Motion: when a new question joins the chain, its node and text rise in
 * once. That is the only movement; reduced motion shows it in place.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { uiMotion } from '@socrates/theme';
import { R, S, focusRing, insetRing, shadow, sheets, transition } from '../look';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { usePressFeedback } from '../primitives/UiButton';
import { nativeDriver, useReducedMotion } from '../turn/parts';
import { PillAction, dataSet } from '../learn/parts';
import { chainNodeLabel, chainView, type ChainCandidate, type ChainStep } from './model';

export interface QuestionChainStrings {
  /** Group label, also the eyebrow ("Question chain"). */
  title: string;
  /** Small caption above the next questions ("Ask next"). */
  next: string;
  /** Caption above mistake-book candidates ("From your mistakes"). */
  nextFromMistakes: string;
  /** Toggle label that unfolds the walked part ("Show all"). */
  expand: string;
  /** Marker where walked steps are folded ("{n} more questions"). */
  folded: string;
  collapse: string;
  /** Prefix read before the current question ("Current question"). */
  current: string;
}

export interface QuestionChainProps {
  steps: readonly ChainStep[];
  candidates: readonly ChainCandidate[];
  strings: QuestionChainStrings;
  onSelect: (candidate: ChainCandidate) => void;
  /** Disable candidates while a reply is streaming. */
  busy?: boolean;
  testID?: string;
}

const NODE_W = 32;
const NODE_H = 24;
const RAIL = 32;

type NodeTone = 'walked' | 'current' | 'next';

/**
 * A step's number as a capsule (site "How a session flows" `01`): ink for
 * the current question, pale fill for walked ones, a white ringed capsule
 * for the questions that could come next. Numbers, never dots.
 */
function ChainNode({ label, tone }: { label: string; tone: NodeTone }) {
  const { colors } = useUiTheme();
  return (
    <View
      aria-hidden
      style={{
        width: NODE_W,
        height: NODE_H,
        borderRadius: R.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: tone === 'current' ? colors.ink : tone === 'walked' ? colors.fill : colors.card,
        boxShadow: tone === 'next' ? insetRing(colors.hairlineStrong) : undefined,
      }}
    >
      <UiText variant="labelSm" tone={tone === 'current' ? 'onInk' : tone === 'walked' ? 'tertiary' : 'secondary'} style={{ fontVariant: ['tabular-nums'] }}>{label}</UiText>
    </View>
  );
}

/** Left rail: a node with the spine running above and/or below it. */
function Rail({ label, tone, lineAbove, lineBelow, nodeTop }: { label: string; tone: NodeTone; lineAbove: boolean; lineBelow: boolean; nodeTop: number }) {
  const { colors } = useUiTheme();
  const line = { position: 'absolute' as const, left: RAIL / 2 - 0.5, width: 1, backgroundColor: colors.hairlineStrong };
  return (
    <View style={{ width: RAIL, alignSelf: 'stretch', marginRight: S[100] }}>
      {lineAbove ? <View style={[line, { top: 0, height: nodeTop }]} /> : null}
      {lineBelow ? <View style={[line, { top: nodeTop + NODE_H, bottom: 0 }]} /> : null}
      <View style={{ position: 'absolute', top: nodeTop, left: (RAIL - NODE_W) / 2 }}>
        <ChainNode label={label} tone={tone} />
      </View>
    </View>
  );
}

function useJoinMotion(stepCount: number) {
  const reduced = useReducedMotion();
  const value = useRef(new Animated.Value(1)).current;
  const previous = useRef(stepCount);
  useEffect(() => {
    const grew = stepCount > previous.current;
    previous.current = stepCount;
    if (!grew || reduced) {
      value.setValue(1);
      return undefined;
    }
    value.setValue(0);
    const animation = Animated.timing(value, { toValue: 1, duration: uiMotion.enter, useNativeDriver: nativeDriver });
    animation.start();
    return () => animation.stop();
  }, [stepCount, reduced, value]);
  return {
    opacity: value,
    transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
  };
}

/** A question to follow: the site's answer bubble (white, 18px radius, shadow-1) with a quiet arrow. */
function CandidateRow({ candidate, label, last, busy, onSelect }: { candidate: ChainCandidate; label: string; last: boolean; busy?: boolean; onSelect: (candidate: ChainCandidate) => void }) {
  const { colors } = useUiTheme();
  const reduced = useReducedMotion();
  const { scale, hovered, focused, handlers } = usePressFeedback();
  const live = hovered && !busy;
  return (
    <View style={{ flexDirection: 'row' }}>
      <Rail label={label} tone="next" lineAbove lineBelow={!last} nodeTop={8} />
      <View style={{ flex: 1, minWidth: 0, paddingBottom: last ? 0 : S[75] }}>
        <Pressable
          role="button"
          testID={`question-chain-next-${candidate.id}`}
          aria-label={candidate.text}
          aria-disabled={busy || undefined}
          disabled={busy}
          onPress={() => onSelect(candidate)}
          {...handlers}
          {...dataSet({ kind: candidate.kind })}
          style={{ alignSelf: 'flex-start', maxWidth: '100%' }}
        >
          <Animated.View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: S[100],
              minHeight: 40,
              paddingVertical: S[75],
              paddingLeft: S[200],
              paddingRight: S[100],
              borderRadius: R.face,
              backgroundColor: colors.card,
              boxShadow: shadow(colors, live ? 'overlay' : 'raised'),
              opacity: busy ? 0.5 : 1,
              ...focusRing(colors, focused),
              ...transition('box-shadow', reduced, 200),
              transform: [{ scale }],
            }}
          >
            <UiText variant="bodySm" style={{ flexShrink: 1 }}>{candidate.text}</UiText>
            <UiText variant="labelSm" tone={live ? 'ink' : 'tertiary'} aria-hidden>→</UiText>
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
}

export function QuestionChain({ steps, candidates, strings, onSelect, busy, testID = 'question-chain' }: QuestionChainProps) {
  const { colors } = useUiTheme();
  const [expanded, setExpanded] = useState(false);
  const view = chainView(steps, expanded);
  const join = useJoinMotion(steps.length);
  const fromMistakes = candidates.length > 0 && candidates.every((candidate) => candidate.kind === 'mistake');
  const hasCandidates = candidates.length > 0;
  const walkedCount = view.walked.length + view.hiddenCount;

  if (!view.current && !hasCandidates) return null;
  const subtle = sheets(colors).subtle;

  return (
    <View
      testID={testID}
      role="group"
      aria-label={strings.title}
      style={{ gap: S[100], paddingHorizontal: S[200], paddingTop: S[100], paddingBottom: S[200], borderRadius: R.sheet, backgroundColor: subtle, boxShadow: insetRing(colors.hairline) }}
      {...dataSet({ steps: steps.length })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: S[100], minHeight: 32 }}>
        <UiText variant="labelSm" tone="secondary">{strings.title}</UiText>
        {walkedCount > 2 ? (
          <PillAction
            size="sm"
            testID="question-chain-toggle"
            label={expanded ? strings.collapse : strings.expand}
            expanded={expanded}
            chevron
            onPress={() => setExpanded((open) => !open)}
          />
        ) : null}
      </View>

      <View>
        {view.walked.map((step, position) => (
          <View key={step.id} testID={`question-chain-walked-${step.index}`} style={{ flexDirection: 'row' }}>
            <Rail label={chainNodeLabel(step.index)} tone="walked" lineAbove={position > 0} lineBelow nodeTop={1} />
            <View style={{ flex: 1, minWidth: 0, paddingBottom: S[100], paddingTop: 1 }}>
              <UiText variant="bodySm" tone="tertiary" numberOfLines={1}>{step.text}</UiText>
              {position === 0 && view.hiddenCount > 0 ? (
                <UiText testID="question-chain-folded" variant="labelSm" tone="tertiary" style={{ marginTop: S[100] }}>
                  {strings.folded.replace('{n}', String(view.hiddenCount))}
                </UiText>
              ) : null}
            </View>
          </View>
        ))}

        {view.current ? (
          <Animated.View testID="question-chain-current" style={[{ flexDirection: 'row' }, join]}>
            <Rail
              label={chainNodeLabel(view.current.index)}
              tone="current"
              lineAbove={view.walked.length > 0}
              lineBelow={hasCandidates}
              nodeTop={1}
            />
            <View style={{ flex: 1, minWidth: 0, paddingBottom: hasCandidates ? S[200] : 0, paddingTop: 1, gap: 2 }}>
              <UiText variant="label" accessibilityLabel={`${strings.current}: ${view.current.text}`}>{view.current.text}</UiText>
            </View>
          </Animated.View>
        ) : null}

        {hasCandidates ? (
          <View style={{ flexDirection: 'row' }}>
            <View style={{ width: RAIL, alignSelf: 'stretch', marginRight: S[100] }}>
              {view.current ? <ChainSpine /> : null}
            </View>
            <UiText variant="labelSm" tone="tertiary" style={{ paddingBottom: S[75] }}>
              {fromMistakes ? strings.nextFromMistakes : strings.next}
            </UiText>
          </View>
        ) : null}

        {candidates.map((candidate, position) => (
          <CandidateRow
            key={candidate.id}
            candidate={candidate}
            label={chainNodeLabel(view.nextIndex)}
            last={position === candidates.length - 1}
            busy={busy}
            onSelect={onSelect}
          />
        ))}
      </View>
    </View>
  );
}

function ChainSpine() {
  const { colors } = useUiTheme();
  return <View style={{ position: 'absolute', left: RAIL / 2 - 0.5, top: 0, bottom: 0, width: 1, backgroundColor: colors.hairlineStrong }} />;
}

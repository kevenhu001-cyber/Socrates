/**
 * RN-4 — the question chain ("Think out loud").
 *
 * One vertical spine, drawn as a 1px hairline, with numbered rounded-square
 * nodes (never dots). From top to bottom:
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
import { uiMotion, uiRadius, uiSpace } from '@socrates/theme';
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

const NODE = 22;
const RAIL = 32;

type NodeTone = 'walked' | 'current' | 'next';

function ChainNode({ label, tone }: { label: string; tone: NodeTone }) {
  const { colors } = useUiTheme();
  return (
    <View
      aria-hidden
      style={{
        width: NODE,
        height: NODE,
        borderRadius: 7,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: tone === 'current' ? colors.ink : tone === 'walked' ? colors.fill : colors.card,
        borderWidth: tone === 'next' ? 1 : 0,
        borderColor: colors.hairlineStrong,
      }}
    >
      <UiText variant="eyebrow" tone={tone === 'current' ? 'onInk' : 'secondary'} style={{ letterSpacing: 0 }}>{label}</UiText>
    </View>
  );
}

/** Left rail: a node with the spine running above and/or below it. */
function Rail({ label, tone, lineAbove, lineBelow, nodeTop }: { label: string; tone: NodeTone; lineAbove: boolean; lineBelow: boolean; nodeTop: number }) {
  const { colors } = useUiTheme();
  const line = { position: 'absolute' as const, left: RAIL / 2 - 0.5, width: 1, backgroundColor: colors.hairlineStrong };
  return (
    <View style={{ width: RAIL, alignSelf: 'stretch' }}>
      {lineAbove ? <View style={[line, { top: 0, height: nodeTop }]} /> : null}
      {lineBelow ? <View style={[line, { top: nodeTop + NODE, bottom: 0 }]} /> : null}
      <View style={{ position: 'absolute', top: nodeTop, left: (RAIL - NODE) / 2 }}>
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

function CandidateRow({ candidate, label, last, busy, onSelect }: { candidate: ChainCandidate; label: string; last: boolean; busy?: boolean; onSelect: (candidate: ChainCandidate) => void }) {
  const { colors } = useUiTheme();
  const { scale, hovered, focused, handlers } = usePressFeedback();
  return (
    <View style={{ flexDirection: 'row' }}>
      <Rail label={label} tone="next" lineAbove lineBelow={!last} nodeTop={uiSpace[2] + 1} />
      <View style={{ flex: 1, paddingBottom: last ? 0 : uiSpace[2] }}>
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
              gap: uiSpace[2],
              minHeight: 40,
              paddingVertical: uiSpace[2],
              paddingLeft: uiSpace[4],
              paddingRight: uiSpace[3],
              borderRadius: uiRadius.pill,
              borderWidth: 1,
              borderColor: hovered && !busy ? colors.hairlineStrong : colors.hairline,
              backgroundColor: hovered && !busy ? colors.fill : colors.card,
              opacity: busy ? 0.5 : 1,
              outlineStyle: focused ? 'solid' : undefined,
              outlineWidth: focused ? 2 : 0,
              outlineColor: colors.ink,
              outlineOffset: 2,
              transform: [{ scale }],
            }}
          >
            <UiText variant="bodySm" style={{ flexShrink: 1 }}>{candidate.text}</UiText>
            <UiText variant="labelSm" tone="tertiary" aria-hidden>→</UiText>
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
}

export function QuestionChain({ steps, candidates, strings, onSelect, busy, testID = 'question-chain' }: QuestionChainProps) {
  const [expanded, setExpanded] = useState(false);
  const view = chainView(steps, expanded);
  const join = useJoinMotion(steps.length);
  const fromMistakes = candidates.length > 0 && candidates.every((candidate) => candidate.kind === 'mistake');
  const hasCandidates = candidates.length > 0;
  const walkedCount = view.walked.length + view.hiddenCount;

  if (!view.current && !hasCandidates) return null;

  return (
    <View testID={testID} role="group" aria-label={strings.title} style={{ gap: uiSpace[2] }} {...dataSet({ steps: steps.length })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 24 }}>
        <UiText variant="eyebrow" tone="tertiary">{strings.title}</UiText>
        {walkedCount > 2 ? (
          <PillAction
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
            <View style={{ flex: 1, paddingBottom: uiSpace[3], paddingTop: 2 }}>
              <UiText variant="bodySm" tone="secondary" numberOfLines={1}>{step.text}</UiText>
              {position === 0 && view.hiddenCount > 0 ? (
                <UiText testID="question-chain-folded" variant="labelSm" tone="tertiary" style={{ marginTop: uiSpace[3] }}>
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
            <View style={{ flex: 1, paddingBottom: hasCandidates ? uiSpace[4] : 0, paddingTop: 1, gap: 2 }}>
              <UiText variant="label" accessibilityLabel={`${strings.current}: ${view.current.text}`}>{view.current.text}</UiText>
            </View>
          </Animated.View>
        ) : null}

        {hasCandidates ? (
          <View style={{ flexDirection: 'row' }}>
            <View style={{ width: RAIL, alignSelf: 'stretch' }}>
              {view.current ? <ChainSpine /> : null}
            </View>
            <UiText variant="eyebrow" tone="tertiary" style={{ paddingBottom: uiSpace[2] }}>
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

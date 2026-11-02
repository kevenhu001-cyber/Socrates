/**
 * RN-5 knowledge map panel: header + snapshot action, the pill graph, the
 * mastery-grouped list and the snapshot history. Picking a node opens its
 * detail in a right-hand drawer on wide screens and a bottom sheet on phones.
 * Commands (go, confidence, note, snapshot) belong to the host.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { H, R, S, focusRing, insetRing, shadow, sheets, transition } from '../look';
import { Chevron, useReducedMotion } from '../turn/parts';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { usePressFeedback } from '../primitives/UiButton';
import { PillAction, dataSet } from '../learn/parts';
import { KnowledgeGraphView, MasterySwatch } from './KnowledgeGraphView';
import {
  conceptRelations,
  knowledgeNodeName,
  knowledgeRelations,
  knowledgeSections,
  nextConfidence,
  normalizeKnowledgeStatus,
  snapshotHistory,
  type BoundarySnapshotInput,
  type KnowledgeNodeInput,
} from './model';
import { defaultKnowledgeStrings, fill, type KnowledgeStrings } from './strings';

export interface KnowledgeMapProps {
  nodes: readonly KnowledgeNodeInput[];
  currentNode: number;
  history: readonly BoundarySnapshotInput[];
  /** Shown after "Last updated" (host formats the date). */
  updatedLabel: string;
  strings?: KnowledgeStrings;
  /** Breakpoint for drawer vs. bottom sheet. */
  wideBreakpoint?: number;
  onSnapshot: () => void;
  onGo: (index: number) => void;
  onConfidence: (index: number, value: number) => void;
  onNote: (index: number, value: string) => void;
  /** RN-6: ask the tutor for a practice question on this node. */
  onPractice?: (index: number) => void;
  /** RN-6: state of an on-demand definitions/links update. */
  conceptStatus?: 'idle' | 'loading' | 'error';
}

export function KnowledgeMap(props: KnowledgeMapProps) {
  const strings = props.strings ?? defaultKnowledgeStrings;
  const [selected, setSelected] = useState<number | null>(null);
  const { nodes } = props;
  useEffect(() => {
    if (selected !== null && selected >= nodes.length) setSelected(null);
  }, [nodes.length, selected]);

  if (!nodes.length) {
    return (
      <View style={{ paddingVertical: S[300], paddingHorizontal: S[75] }} {...dataSet({ kbEmpty: '1' })}>
        <UiText variant="bodySm" tone="tertiary" align="center">{strings.empty}</UiText>
      </View>
    );
  }
  const choose = (index: number) => setSelected((current) => (current === index ? null : index));
  const history = snapshotHistory(props.history);
  return (
    <View style={{ gap: S[200] }} {...dataSet({ kbMap: '1' })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: S[75] }}>
        <View style={{ flexShrink: 1, minWidth: 0, gap: 2 }}>
          <UiText variant="label" numberOfLines={1}>{strings.title}</UiText>
          <UiText variant="labelSm" tone="tertiary" style={{ fontWeight: '400' }} numberOfLines={1}>{`${strings.lastUpdated}: ${props.updatedLabel}`}</UiText>
        </View>
        <PillAction size="sm" label={strings.snapshot} onPress={props.onSnapshot} data={{ kbSnapshot: '1' }} />
      </View>
      {props.conceptStatus === 'loading' || props.conceptStatus === 'error' ? (
        <UiText variant="labelSm" tone="tertiary" aria-live="polite" {...dataSet({ kbConceptStatus: props.conceptStatus })}>
          {props.conceptStatus === 'loading' ? strings.updating : strings.updateFailed}
        </UiText>
      ) : null}
      <KnowledgeGraphView nodes={nodes} activeIndex={props.currentNode} selectedIndex={selected} strings={strings} onSelect={choose} />
      <KnowledgeList nodes={nodes} strings={strings} onSelect={choose} />
      {history.length ? (
        <View style={{ gap: S[75] }}>
          <UiText variant="labelSm" tone="tertiary">{strings.history}</UiText>
          <HistoryRows rows={history} />
        </View>
      ) : null}
      {selected !== null && nodes[selected] ? (
        <KnowledgeNodeSheet
          index={selected}
          nodes={nodes}
          history={history}
          strings={strings}
          wideBreakpoint={props.wideBreakpoint ?? 768}
          onClose={() => setSelected(null)}
          onSelect={setSelected}
          onGo={() => props.onGo(selected)}
          onPractice={props.onPractice ? () => props.onPractice!(selected) : undefined}
          onConfidence={(value) => props.onConfidence(selected, value)}
          onNote={(value) => props.onNote(selected, value)}
        />
      ) : null}
    </View>
  );
}

function HistoryRows({ rows, label }: { rows: Array<{ date: string; summary: string }>; label?: string }) {
  const { colors } = useUiTheme();
  return (
    <View role="list" aria-label={label} style={{ borderTopWidth: 1, borderTopColor: colors.hairline }}>
      {rows.map((row, index) => (
        <View key={`${row.date}-${index}`} role="listitem" {...dataSet({ kbHistoryRow: index })} style={{ flexDirection: 'row', gap: S[100], paddingVertical: S[75], borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
          <UiText variant="labelSm" tone="tertiary" style={{ fontVariant: ['tabular-nums'] }}>{row.date}</UiText>
          <UiText variant="labelSm" tone="secondary" style={{ flexShrink: 1 }}>{row.summary}</UiText>
        </View>
      ))}
    </View>
  );
}

function KnowledgeRow({ index, name, status, meta, onSelect }: { index: number; name: string; status: ReturnType<typeof normalizeKnowledgeStatus>; meta: string; onSelect: (index: number) => void }) {
  const { colors } = useUiTheme();
  const reduced = useReducedMotion();
  const { subtle } = sheets(colors);
  const { hovered, focused, handlers } = usePressFeedback();
  return (
    <Pressable
      role="button"
      aria-label={name}
      onPress={() => onSelect(index)}
      {...handlers}
      {...dataSet({ kbNode: index, kbStatus: status })}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: S[75],
        minHeight: H.row,
        paddingHorizontal: S[100],
        borderRadius: R.row,
        backgroundColor: hovered ? subtle : 'transparent',
        ...focusRing(colors, focused),
        ...transition('background-color', reduced),
      }}
    >
      <UiText variant="labelSm" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>{name}</UiText>
      {meta ? <UiText variant="labelSm" tone="tertiary" style={{ fontWeight: '400', fontVariant: ['tabular-nums'] }} numberOfLines={1}>{meta}</UiText> : null}
      <Chevron size={6} tone={hovered ? 'ink' : 'tertiary'} />
    </Pressable>
  );
}

function KnowledgeList({ nodes, strings, onSelect }: { nodes: readonly KnowledgeNodeInput[]; strings: KnowledgeStrings; onSelect: (index: number) => void }) {
  const { colors } = useUiTheme();
  return (
    <View style={{ gap: S[200] }}>
      {knowledgeSections(nodes).map((section) => (
        <View key={section.status} role="group" aria-label={strings.section[section.status]} style={{ gap: S[50] }} {...dataSet({ kbSection: section.status })}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: S[100], paddingBottom: S[50] }}>
            <MasterySwatch status={section.status} label={strings.section[section.status]} />
            <UiText variant="labelSm" tone="tertiary" style={{ fontWeight: '400', fontVariant: ['tabular-nums'] }}>{String(section.entries.length)}</UiText>
          </View>
          {section.entries.map(({ node, index, name }) => {
            const parts: string[] = [];
            if (section.status === 'internalized') parts.push(fill(strings.verifiedTag, { n: node.verifiedCount || node.questions || 0 }));
            else if (node.questions) parts.push(fill(strings.questions, { n: node.questions }));
            return (
              <View key={`${index}-${name}`}>
                <KnowledgeRow index={index} name={name} status={section.status} meta={parts.join(' · ')} onSelect={onSelect} />
                {section.status === 'fuzzy' && (node.system_note || node.user_note) ? (
                  <View style={{ marginLeft: S[100], marginRight: S[50], marginBottom: S[50], paddingHorizontal: S[100], paddingVertical: S[75], gap: 2, borderRadius: R.row, backgroundColor: sheets(colors).subtle, boxShadow: insetRing(colors.hairline) }}>
                    {node.system_note ? <UiText variant="labelSm" tone="secondary" style={{ fontWeight: '400' }}>{`${strings.systemTag} · ${node.system_note}`}</UiText> : null}
                    {node.user_note ? <UiText variant="labelSm" tone="secondary" style={{ fontWeight: '400' }}>{`${strings.userTag} · ${node.user_note}`}</UiText> : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function DetailSection({ label, children, data }: { label: string; children: ReactNode; data?: Record<string, string> }) {
  const { colors } = useUiTheme();
  return (
    <View style={{ gap: S[75], paddingTop: S[200], borderTopWidth: 1, borderTopColor: colors.hairline }} {...dataSet(data ?? {})}>
      <UiText variant="labelSm" tone="tertiary" {...dataSet({ kbDetailLabel: '1' })}>{label}</UiText>
      {children}
    </View>
  );
}

function ConfidenceSteps({ value, strings, onChange }: { value: number; strings: KnowledgeStrings; onChange: (value: number) => void }) {
  const { colors } = useUiTheme();
  return (
    <View role="group" aria-label={strings.detail.confidence} style={{ flexDirection: 'row', alignSelf: 'flex-start', gap: 2, padding: 3, borderRadius: R.pill, backgroundColor: colors.fill }}>
      {[1, 2, 3, 4, 5].map((step) => {
        /* Only the chosen level is filled with ink; the rest stay on the pale track. */
        const on = step === value;
        const label = fill(strings.detail.confidenceSet, { n: step });
        return (
          <Pressable
            key={step}
            role="button"
            aria-label={label}
            aria-pressed={on}
            onPress={() => onChange(nextConfidence(value, step))}
            {...dataSet({ kbConf: step })}
            style={{ width: 36, height: 28, borderRadius: R.pill, backgroundColor: on ? colors.ink : 'transparent', alignItems: 'center', justifyContent: 'center' }}
          >
            <UiText variant="labelSm" tone={on ? 'onInk' : 'secondary'} style={{ fontVariant: ['tabular-nums'] }}>{String(step)}</UiText>
          </Pressable>
        );
      })}
    </View>
  );
}

function KnowledgeNodeSheet({ index, nodes, history, strings, wideBreakpoint, onClose, onSelect, onGo, onPractice, onConfidence, onNote }: {
  index: number;
  nodes: readonly KnowledgeNodeInput[];
  history: Array<{ date: string; summary: string }>;
  strings: KnowledgeStrings;
  wideBreakpoint: number;
  onClose: () => void;
  onSelect: (index: number) => void;
  onGo: () => void;
  onPractice?: () => void;
  onConfidence: (value: number) => void;
  onNote: (value: string) => void;
}) {
  const { colors, fontFamily } = useUiTheme();
  const screen = useWindowDimensions();
  const wide = screen.width >= wideBreakpoint;
  const node = nodes[index]!;
  const name = knowledgeNodeName(node, index);
  const status = normalizeKnowledgeStatus(node.status);
  const relations = knowledgeRelations(nodes, index);
  /* RN-6: the model's own concept links win; the learning path is the
     fallback for sessions that have none. */
  const concepts = conceptRelations(nodes, index);
  const definition = typeof node.definition === 'string' ? node.definition.trim() : '';
  const confidence = typeof node.confidence_score === 'number' ? node.confidence_score : 0;
  const d = strings.detail;
  const panelStyle = wide
    ? { position: 'absolute' as const, top: S[100], right: S[100], bottom: S[100], width: Math.min(420, screen.width - 48), borderRadius: R.stage }
    : { position: 'absolute' as const, left: 0, right: 0, bottom: 0, maxHeight: Math.round(screen.height * 0.86), borderTopLeftRadius: R.stage, borderTopRightRadius: R.stage };
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable aria-label={d.close} onPress={onClose} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.16)' }} />
        <View
          role="dialog"
          aria-modal
          aria-label={name}
          {...dataSet({ kbNodeDetail: index, kbPresentation: wide ? 'drawer' : 'sheet' })}
          style={[panelStyle, { backgroundColor: colors.card, boxShadow: shadow(colors, 'dialog'), overflow: 'hidden' }]}
        >
          {!wide ? <View aria-hidden style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: R.pill, backgroundColor: colors.hairlineStrong, marginTop: S[75] }} /> : null}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: S[100], paddingHorizontal: S[300], paddingTop: S[300], paddingBottom: S[200] }}>
            <View style={{ flex: 1, minWidth: 0, gap: S[75] }}>
              <UiText variant="title">{name}</UiText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: S[75] }}>
                <View {...dataSet({ kbDetailStatus: status })} style={{ height: H.tag, justifyContent: 'center', paddingHorizontal: 10, borderRadius: R.pill, backgroundColor: status === 'internalized' ? colors.ink : status === 'blank' ? colors.fill : colors.card, boxShadow: status === 'fuzzy' ? insetRing(colors.ink, 1.5) : undefined }}>
                  <UiText variant="labelSm" tone={status === 'internalized' ? 'onInk' : status === 'fuzzy' ? 'ink' : 'tertiary'}>{strings.status[status]}</UiText>
                </View>
              </View>
            </View>
            <PillAction size="sm" tone="soft" label="✕" accessibilityLabel={d.close} onPress={onClose} data={{ kbDetailClose: '1' }} />
          </View>
          <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: S[300], paddingBottom: S[300], gap: S[200] }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S[75] }}>
              <PillAction tone="solid" label={d.go} accessibilityLabel={d.goTitle} onPress={onGo} data={{ kbGo: index }} />
              {onPractice ? <PillAction label={d.practice} accessibilityLabel={d.practiceTitle} onPress={onPractice} data={{ kbPractice: index }} /> : null}
            </View>
            {definition ? (
              <DetailSection label={d.definition} data={{ kbDefinitionSection: '1' }}>
                <UiText variant="bodySm" {...dataSet({ kbDefinition: '1' })}>{definition}</UiText>
              </DetailSection>
            ) : null}
            <DetailSection label={d.systemNote}>
              <UiText variant="bodySm" tone={node.system_note ? 'ink' : 'tertiary'} {...dataSet({ kbSystemNote: '1' })}>{node.system_note || d.noSystemNote}</UiText>
            </DetailSection>
            <DetailSection label={d.confidence}>
              <ConfidenceSteps value={confidence} strings={strings} onChange={onConfidence} />
            </DetailSection>
            <DetailSection label={d.connections}>
              {concepts.length ? concepts.map((relation) => (
                <View key={`c-${relation.index}`} style={{ gap: S[75], padding: S[100], borderRadius: R.row, backgroundColor: sheets(colors).subtle, boxShadow: insetRing(colors.hairline) }} {...dataSet({ kbRelation: 'concept', kbRelationTo: relation.index })}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: S[75] }}>
                    {relation.relation ? <UiText variant="labelSm" tone="tertiary">{relation.relation}</UiText> : null}
                    <PillAction size="sm" label={relation.name} accessibilityLabel={fill(d.open, { name: relation.name })} onPress={() => onSelect(relation.index)} chevron={false} />
                  </View>
                  <UiText variant="labelSm" tone="secondary" style={{ fontWeight: '400' }} {...dataSet({ kbRelationWhy: '1' })}>{relation.why}</UiText>
                </View>
              )) : relations.length ? relations.map((relation) => (
                <View key={relation.role} style={{ gap: S[75], padding: S[100], borderRadius: R.row, backgroundColor: sheets(colors).subtle, boxShadow: insetRing(colors.hairline) }} {...dataSet({ kbRelation: relation.role })}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: S[75] }}>
                    <UiText variant="labelSm" tone="tertiary">{relation.role === 'before' ? d.before : d.after}</UiText>
                    <PillAction size="sm" label={relation.name} accessibilityLabel={fill(d.open, { name: relation.name })} onPress={() => onSelect(relation.index)} chevron={false} />
                  </View>
                  <UiText variant="labelSm" tone="secondary" style={{ fontWeight: '400' }}>
                    {relation.role === 'before'
                      ? fill(d.whyBefore, { a: relation.name, b: name })
                      : fill(d.whyAfter, { a: name, b: relation.name })}
                  </UiText>
                </View>
              )) : <UiText variant="labelSm" tone="tertiary">{d.noConnections}</UiText>}
            </DetailSection>
            <DetailSection label={d.yourNote}>
              <TextInput
                key={index}
                multiline
                numberOfLines={3}
                aria-label={d.yourNote}
                placeholder={d.notePlaceholder}
                placeholderTextColor={colors.inkTertiary}
                defaultValue={node.user_note || ''}
                onChangeText={onNote}
                {...dataSet({ kbUserNote: index })}
                style={{ minHeight: 72, borderWidth: 0, boxShadow: insetRing(colors.hairlineStrong), borderRadius: R.row, paddingHorizontal: S[100], paddingVertical: S[75], color: colors.ink, fontFamily, fontSize: 14, lineHeight: 22, textAlignVertical: 'top' }}
              />
            </DetailSection>
            <DetailSection label={d.history}>
              {history.length ? <HistoryRows rows={history} label={d.history} /> : <UiText variant="labelSm" tone="tertiary">{d.noHistory}</UiText>}
            </DetailSection>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

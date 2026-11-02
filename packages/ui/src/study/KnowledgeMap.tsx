/**
 * RN-5 knowledge map panel: header + snapshot action, the pill graph, the
 * mastery-grouped list and the snapshot history. Picking a node opens its
 * detail in a right-hand drawer on wide screens and a bottom sheet on phones.
 * Commands (go, confidence, note, snapshot) belong to the host.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { uiRadius, uiSpace } from '@socrates/theme';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { usePressFeedback } from '../primitives/UiButton';
import { PillAction, dataSet } from '../learn/parts';
import { KnowledgeGraphView, MasterySwatch } from './KnowledgeGraphView';
import {
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
      <View style={{ paddingVertical: uiSpace[5], paddingHorizontal: uiSpace[2] }} {...dataSet({ kbEmpty: '1' })}>
        <UiText variant="bodySm" tone="tertiary" align="center">{strings.empty}</UiText>
      </View>
    );
  }
  const choose = (index: number) => setSelected((current) => (current === index ? null : index));
  const history = snapshotHistory(props.history);
  return (
    <View style={{ gap: uiSpace[4] }} {...dataSet({ kbMap: '1' })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: uiSpace[2] }}>
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <UiText variant="label" numberOfLines={1}>{strings.title}</UiText>
          <UiText variant="eyebrow" tone="tertiary" style={{ letterSpacing: 0 }} numberOfLines={1}>{`${strings.lastUpdated}: ${props.updatedLabel}`}</UiText>
        </View>
        <PillAction label={strings.snapshot} onPress={props.onSnapshot} data={{ kbSnapshot: '1' }} />
      </View>
      <KnowledgeGraphView nodes={nodes} activeIndex={props.currentNode} selectedIndex={selected} strings={strings} onSelect={choose} />
      <KnowledgeList nodes={nodes} strings={strings} onSelect={choose} />
      {history.length ? (
        <View style={{ gap: uiSpace[2] }}>
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
        <View key={`${row.date}-${index}`} role="listitem" {...dataSet({ kbHistoryRow: index })} style={{ flexDirection: 'row', gap: uiSpace[3], paddingVertical: uiSpace[2], borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
          <UiText variant="labelSm" tone="tertiary" style={{ fontVariant: ['tabular-nums'] }}>{row.date}</UiText>
          <UiText variant="labelSm" tone="secondary" style={{ flexShrink: 1 }}>{row.summary}</UiText>
        </View>
      ))}
    </View>
  );
}

function KnowledgeRow({ index, name, status, meta, onSelect }: { index: number; name: string; status: ReturnType<typeof normalizeKnowledgeStatus>; meta: string; onSelect: (index: number) => void }) {
  const { colors } = useUiTheme();
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
        gap: uiSpace[2],
        minHeight: 36,
        paddingHorizontal: uiSpace[3],
        borderRadius: uiRadius.md,
        backgroundColor: hovered ? colors.fill : 'transparent',
        outlineStyle: focused ? 'solid' : undefined,
        outlineWidth: focused ? 2 : 0,
        outlineColor: colors.ink,
      }}
    >
      <UiText variant="labelSm" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>{name}</UiText>
      {meta ? <UiText variant="eyebrow" tone="tertiary" style={{ letterSpacing: 0 }} numberOfLines={1}>{meta}</UiText> : null}
    </Pressable>
  );
}

function KnowledgeList({ nodes, strings, onSelect }: { nodes: readonly KnowledgeNodeInput[]; strings: KnowledgeStrings; onSelect: (index: number) => void }) {
  const { colors } = useUiTheme();
  return (
    <View style={{ gap: uiSpace[3] }}>
      {knowledgeSections(nodes).map((section) => (
        <View key={section.status} role="group" aria-label={strings.section[section.status]} style={{ gap: uiSpace[1] }} {...dataSet({ kbSection: section.status })}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: uiSpace[3] }}>
            <MasterySwatch status={section.status} label={strings.section[section.status]} />
            <UiText variant="eyebrow" tone="tertiary" style={{ letterSpacing: 0 }}>{String(section.entries.length)}</UiText>
          </View>
          {section.entries.map(({ node, index, name }) => {
            const parts: string[] = [];
            if (section.status === 'internalized') parts.push(fill(strings.verifiedTag, { n: node.verifiedCount || node.questions || 0 }));
            else if (node.questions) parts.push(fill(strings.questions, { n: node.questions }));
            return (
              <View key={`${index}-${name}`}>
                <KnowledgeRow index={index} name={name} status={section.status} meta={parts.join(' · ')} onSelect={onSelect} />
                {section.status === 'fuzzy' && (node.system_note || node.user_note) ? (
                  <View style={{ marginLeft: uiSpace[3], paddingLeft: uiSpace[3], borderLeftWidth: 1, borderLeftColor: colors.hairline, gap: 2, marginBottom: uiSpace[1] }}>
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
    <View style={{ gap: uiSpace[2], paddingTop: uiSpace[4], borderTopWidth: 1, borderTopColor: colors.hairline }} {...dataSet(data ?? {})}>
      <UiText variant="labelSm" tone="tertiary" {...dataSet({ kbDetailLabel: '1' })}>{label}</UiText>
      {children}
    </View>
  );
}

function ConfidenceSteps({ value, strings, onChange }: { value: number; strings: KnowledgeStrings; onChange: (value: number) => void }) {
  const { colors } = useUiTheme();
  return (
    <View role="group" aria-label={strings.detail.confidence} style={{ flexDirection: 'row', gap: uiSpace[1] }}>
      {[1, 2, 3, 4, 5].map((step) => {
        const on = step <= value;
        const label = fill(strings.detail.confidenceSet, { n: step });
        return (
          <Pressable
            key={step}
            role="button"
            aria-label={label}
            aria-pressed={on}
            onPress={() => onChange(nextConfidence(value, step))}
            {...dataSet({ kbConf: step })}
            style={{ width: 36, height: 24, borderRadius: uiRadius.pill, borderWidth: 1, borderColor: on ? colors.ink : colors.hairlineStrong, backgroundColor: on ? colors.ink : 'transparent', alignItems: 'center', justifyContent: 'center' }}
          >
            <UiText variant="eyebrow" tone={on ? 'onInk' : 'tertiary'} style={{ letterSpacing: 0 }}>{String(step)}</UiText>
          </Pressable>
        );
      })}
    </View>
  );
}

function KnowledgeNodeSheet({ index, nodes, history, strings, wideBreakpoint, onClose, onSelect, onGo, onConfidence, onNote }: {
  index: number;
  nodes: readonly KnowledgeNodeInput[];
  history: Array<{ date: string; summary: string }>;
  strings: KnowledgeStrings;
  wideBreakpoint: number;
  onClose: () => void;
  onSelect: (index: number) => void;
  onGo: () => void;
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
  const confidence = typeof node.confidence_score === 'number' ? node.confidence_score : 0;
  const d = strings.detail;
  const panelStyle = wide
    ? { position: 'absolute' as const, top: uiSpace[3], right: uiSpace[3], bottom: uiSpace[3], width: Math.min(420, screen.width - 48), borderRadius: uiRadius.card }
    : { position: 'absolute' as const, left: 0, right: 0, bottom: 0, maxHeight: Math.round(screen.height * 0.86), borderTopLeftRadius: uiRadius.card, borderTopRightRadius: uiRadius.card };
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable aria-label={d.close} onPress={onClose} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.16)' }} />
        <View
          role="dialog"
          aria-modal
          aria-label={name}
          {...dataSet({ kbNodeDetail: index, kbPresentation: wide ? 'drawer' : 'sheet' })}
          style={[panelStyle, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, overflow: 'hidden' }]}
        >
          {!wide ? <View aria-hidden style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: uiRadius.pill, backgroundColor: colors.hairlineStrong, marginTop: uiSpace[2] }} /> : null}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: uiSpace[3], paddingHorizontal: uiSpace[5], paddingTop: uiSpace[4], paddingBottom: uiSpace[3] }}>
            <View style={{ flex: 1, minWidth: 0, gap: uiSpace[2] }}>
              <UiText variant="title">{name}</UiText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: uiSpace[2] }}>
                <View {...dataSet({ kbDetailStatus: status })} style={{ paddingHorizontal: uiSpace[3], paddingVertical: 2, borderRadius: uiRadius.pill, borderWidth: status === 'fuzzy' ? 1.5 : 1, borderColor: status === 'blank' ? colors.hairlineStrong : colors.ink, backgroundColor: status === 'internalized' ? colors.ink : 'transparent' }}>
                  <UiText variant="labelSm" tone={status === 'internalized' ? 'onInk' : status === 'fuzzy' ? 'ink' : 'tertiary'}>{strings.status[status]}</UiText>
                </View>
              </View>
            </View>
            <PillAction label="✕" accessibilityLabel={d.close} onPress={onClose} data={{ kbDetailClose: '1' }} />
          </View>
          <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: uiSpace[5], paddingBottom: uiSpace[5], gap: uiSpace[4] }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: uiSpace[2] }}>
              <PillAction tone="solid" label={d.go} accessibilityLabel={d.goTitle} onPress={onGo} data={{ kbGo: index }} />
            </View>
            <DetailSection label={d.systemNote}>
              <UiText variant="bodySm" tone={node.system_note ? 'ink' : 'tertiary'} {...dataSet({ kbSystemNote: '1' })}>{node.system_note || d.noSystemNote}</UiText>
            </DetailSection>
            <DetailSection label={d.confidence}>
              <ConfidenceSteps value={confidence} strings={strings} onChange={onConfidence} />
            </DetailSection>
            <DetailSection label={d.connections}>
              {relations.length ? relations.map((relation) => (
                <View key={relation.role} style={{ gap: uiSpace[1] }} {...dataSet({ kbRelation: relation.role })}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: uiSpace[2] }}>
                    <UiText variant="eyebrow" tone="tertiary" style={{ letterSpacing: 0 }}>{relation.role === 'before' ? d.before : d.after}</UiText>
                    <PillAction label={relation.name} accessibilityLabel={fill(d.open, { name: relation.name })} onPress={() => onSelect(relation.index)} chevron={false} />
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
                style={{ minHeight: 72, borderWidth: 1, borderColor: colors.hairlineStrong, borderRadius: uiRadius.md, paddingHorizontal: uiSpace[3], paddingVertical: uiSpace[2], color: colors.ink, fontFamily, fontSize: 14, lineHeight: 22, textAlignVertical: 'top' }}
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

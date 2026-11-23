/**
 * RN-5 knowledge map panel: header + snapshot action, the pill graph, the
 * confidence-grouped list and the snapshot history. Picking a node opens its
 * detail in a right-hand drawer on wide screens and a bottom sheet on phones.
 * Commands (go, confidence, note, snapshot) belong to the host.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { dataAttributes } from '../domProps';
import { H, R, S, focusRing, insetRing, shadow, sheets, transition } from '../look';
import { Chevron, useReducedMotion } from '../turn/parts';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { usePressFeedback } from '../primitives/UiButton';
import { PillAction } from '../learn/parts';
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

const BUTTON_RESET: CSSProperties = {
  background: 'none',
  border: 0,
  padding: 0,
  margin: 0,
  font: 'inherit',
  color: 'inherit',
  textAlign: 'inherit',
};

export interface KnowledgeMapProps {
  nodes: readonly KnowledgeNodeInput[];
  currentNode: number;
  history: readonly BoundarySnapshotInput[];
  /** Shown after "Last updated" (host formats the date). */
  updatedLabel: string;
  strings?: KnowledgeStrings;
  /** Host viewport width: drawer at ≥769px, bottom sheet below. */
  wide?: boolean;
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
      <div
        style={{ paddingBlock: S[300], paddingInline: S[75] }}
        {...dataAttributes({ kbEmpty: '1' })}
      >
        <UiText variant="bodySm" tone="tertiary" align="center">
          {strings.empty}
        </UiText>
      </div>
    );
  }
  const choose = (index: number) => setSelected((current) => (current === index ? null : index));
  const history = snapshotHistory(props.history);
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: S[200] }}
      {...dataAttributes({ kbMap: '1' })}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: S[75],
        }}
      >
        <div
          style={{ display: 'flex', flexDirection: 'column', flexShrink: 1, minWidth: 0, gap: 2 }}
        >
          <UiText variant="label" numberOfLines={1}>
            {strings.title}
          </UiText>
          <UiText
            variant="labelSm"
            tone="tertiary"
            style={{ fontWeight: '400' }}
            numberOfLines={1}
          >{`${strings.lastUpdated}: ${props.updatedLabel}`}</UiText>
        </div>
        <PillAction
          size="sm"
          label={strings.snapshot}
          onPress={props.onSnapshot}
          data={{ kbSnapshot: '1' }}
        />
      </div>
      {props.conceptStatus === 'loading' || props.conceptStatus === 'error' ? (
        <UiText
          variant="labelSm"
          tone="tertiary"
          aria-live="polite"
          {...dataAttributes({ kbConceptStatus: props.conceptStatus })}
        >
          {props.conceptStatus === 'loading' ? strings.updating : strings.updateFailed}
        </UiText>
      ) : null}
      <KnowledgeGraphView
        nodes={nodes}
        activeIndex={props.currentNode}
        selectedIndex={selected}
        strings={strings}
        onSelect={choose}
      />
      <KnowledgeList nodes={nodes} strings={strings} onSelect={choose} />
      {history.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[75] }}>
          <UiText variant="labelSm" tone="tertiary">
            {strings.history}
          </UiText>
          <HistoryRows rows={history} />
        </div>
      ) : null}
      {selected !== null && nodes[selected] ? (
        <KnowledgeNodeSheet
          index={selected}
          nodes={nodes}
          history={history}
          strings={strings}
          wide={props.wide ?? true}
          onClose={() => setSelected(null)}
          onSelect={setSelected}
          onGo={() => props.onGo(selected)}
          onPractice={props.onPractice ? () => props.onPractice!(selected) : undefined}
          onConfidence={(value) => props.onConfidence(selected, value)}
          onNote={(value) => props.onNote(selected, value)}
        />
      ) : null}
    </div>
  );
}

function HistoryRows({
  rows,
  label,
}: {
  rows: Array<{ date: string; summary: string }>;
  label?: string;
}) {
  const { colors } = useUiTheme();
  return (
    <div role="list" aria-label={label} style={{ borderTop: `1px solid ${colors.hairline}` }}>
      {rows.map((row, index) => (
        <div
          key={`${row.date}-${index}`}
          role="listitem"
          {...dataAttributes({ kbHistoryRow: index })}
          style={{
            display: 'flex',
            flexDirection: 'row',
            gap: S[100],
            paddingBlock: S[75],
            borderBottom: `1px solid ${colors.hairline}`,
          }}
        >
          <UiText variant="labelSm" tone="tertiary" style={{ fontVariant: ['tabular-nums'] }}>
            {row.date}
          </UiText>
          <UiText variant="labelSm" tone="secondary" style={{ flexShrink: 1 }}>
            {row.summary}
          </UiText>
        </div>
      ))}
    </div>
  );
}

function KnowledgeRow({
  index,
  name,
  status,
  meta,
  onSelect,
}: {
  index: number;
  name: string;
  status: ReturnType<typeof normalizeKnowledgeStatus>;
  meta: string;
  onSelect: (index: number) => void;
}) {
  const { colors } = useUiTheme();
  const reduced = useReducedMotion();
  const { subtle } = sheets(colors);
  const { hovered, focused, handlers } = usePressFeedback();
  return (
    <button
      type="button"
      role="button"
      aria-label={name}
      onClick={() => onSelect(index)}
      {...handlers}
      {...dataAttributes({ kbNode: index, kbStatus: status })}
      style={{
        ...BUTTON_RESET,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: S[75],
        minHeight: H.row,
        paddingInline: S[100],
        borderRadius: R.row,
        backgroundColor: hovered ? subtle : 'transparent',
        ...focusRing(colors, focused),
        ...transition('background-color', reduced),
      }}
    >
      <UiText variant="labelSm" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
        {name}
      </UiText>
      {meta ? (
        <UiText
          variant="labelSm"
          tone="tertiary"
          style={{ fontWeight: '400', fontVariant: ['tabular-nums'] }}
          numberOfLines={1}
        >
          {meta}
        </UiText>
      ) : null}
      <Chevron size={6} tone={hovered ? 'ink' : 'tertiary'} />
    </button>
  );
}

function KnowledgeList({
  nodes,
  strings,
  onSelect,
}: {
  nodes: readonly KnowledgeNodeInput[];
  strings: KnowledgeStrings;
  onSelect: (index: number) => void;
}) {
  const { colors } = useUiTheme();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[200] }}>
      {knowledgeSections(nodes).map((section) => (
        <div
          key={section.status}
          role="group"
          aria-label={strings.section[section.status]}
          style={{ display: 'flex', flexDirection: 'column', gap: S[50] }}
          {...dataAttributes({ kbSection: section.status })}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingInline: S[100],
              paddingBottom: S[50],
            }}
          >
            <MasterySwatch status={section.status} label={strings.section[section.status]} />
            <UiText
              variant="labelSm"
              tone="tertiary"
              style={{ fontWeight: '400', fontVariant: ['tabular-nums'] }}
            >
              {String(section.entries.length)}
            </UiText>
          </div>
          {section.entries.map(({ node, index, name }) => {
            const parts: string[] = [];
            if (section.status === 'internalized')
              parts.push(
                fill(strings.recordedTag, { n: node.verifiedCount || node.questions || 0 }),
              );
            else if (node.questions) parts.push(fill(strings.questions, { n: node.questions }));
            return (
              <div key={`${index}-${name}`}>
                <KnowledgeRow
                  index={index}
                  name={name}
                  status={section.status}
                  meta={parts.join(' · ')}
                  onSelect={onSelect}
                />
                {section.status === 'fuzzy' && (node.system_note || node.user_note) ? (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      marginLeft: S[100],
                      marginRight: S[50],
                      marginBottom: S[50],
                      paddingInline: S[100],
                      paddingBlock: S[75],
                      gap: 2,
                      borderRadius: R.row,
                      backgroundColor: sheets(colors).subtle,
                      boxShadow: insetRing(colors.hairline),
                    }}
                  >
                    {node.system_note ? (
                      <UiText
                        variant="labelSm"
                        tone="secondary"
                        style={{ fontWeight: '400' }}
                      >{`${strings.systemTag} · ${node.system_note}`}</UiText>
                    ) : null}
                    {node.user_note ? (
                      <UiText
                        variant="labelSm"
                        tone="secondary"
                        style={{ fontWeight: '400' }}
                      >{`${strings.userTag} · ${node.user_note}`}</UiText>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function DetailSection({
  label,
  children,
  data,
}: {
  label: string;
  children: ReactNode;
  data?: Record<string, string>;
}) {
  const { colors } = useUiTheme();
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: S[75],
        paddingTop: S[200],
        borderTop: `1px solid ${colors.hairline}`,
      }}
      {...dataAttributes(data ?? {})}
    >
      <UiText variant="labelSm" tone="tertiary" {...dataAttributes({ kbDetailLabel: '1' })}>
        {label}
      </UiText>
      {children}
    </div>
  );
}

function ConfidenceSteps({
  value,
  strings,
  onChange,
}: {
  value: number;
  strings: KnowledgeStrings;
  onChange: (value: number) => void;
}) {
  const { colors } = useUiTheme();
  return (
    <div
      role="group"
      aria-label={strings.detail.confidence}
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignSelf: 'flex-start',
        gap: 2,
        padding: 3,
        borderRadius: R.pill,
        backgroundColor: colors.fill,
      }}
    >
      {[1, 2, 3, 4, 5].map((step) => {
        /* Only the chosen level is filled with ink; the rest stay on the pale track. */
        const on = step === value;
        const label = fill(strings.detail.confidenceSet, { n: step });
        return (
          <button
            key={step}
            type="button"
            role="button"
            aria-label={label}
            aria-pressed={on}
            onClick={() => onChange(nextConfidence(value, step))}
            {...dataAttributes({ kbConf: step })}
            style={{
              ...BUTTON_RESET,
              display: 'inline-flex',
              width: 36,
              height: 28,
              borderRadius: R.pill,
              backgroundColor: on ? colors.ink : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <UiText
              variant="labelSm"
              tone={on ? 'onInk' : 'secondary'}
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {String(step)}
            </UiText>
          </button>
        );
      })}
    </div>
  );
}

function KnowledgeNodeSheet({
  index,
  nodes,
  history,
  strings,
  wide,
  onClose,
  onSelect,
  onGo,
  onPractice,
  onConfidence,
  onNote,
}: {
  index: number;
  nodes: readonly KnowledgeNodeInput[];
  history: Array<{ date: string; summary: string }>;
  strings: KnowledgeStrings;
  wide: boolean;
  onClose: () => void;
  onSelect: (index: number) => void;
  onGo: () => void;
  onPractice?: () => void;
  onConfidence: (value: number) => void;
  onNote: (value: string) => void;
}) {
  const { colors, fontFamily } = useUiTheme();
  const sheetRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    sheetRef.current?.focus();
  }, []);
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
  const panelStyle: CSSProperties = wide
    ? {
        position: 'absolute',
        top: S[100],
        right: S[100],
        bottom: S[100],
        width: 'min(420px, calc(100vw - 48px))',
        borderRadius: R.stage,
      }
    : {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        maxHeight: '86vh',
        borderTopLeftRadius: R.stage,
        borderTopRightRadius: R.stage,
      };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>
      <button
        type="button"
        aria-label={d.close}
        onClick={onClose}
        style={{
          ...BUTTON_RESET,
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.16)',
        }}
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal
        aria-label={name}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
          }
        }}
        {...dataAttributes({ kbNodeDetail: index, kbPresentation: wide ? 'drawer' : 'sheet' })}
        style={{
          ...panelStyle,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: colors.card,
          boxShadow: shadow(colors, 'dialog'),
          overflow: 'hidden',
        }}
      >
        {!wide ? (
          <div
            aria-hidden
            style={{
              alignSelf: 'center',
              width: 36,
              height: 4,
              borderRadius: R.pill,
              backgroundColor: colors.hairlineStrong,
              marginTop: S[75],
            }}
          />
        ) : null}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: S[100],
            paddingInline: S[300],
            paddingTop: S[300],
            paddingBottom: S[200],
          }}
        >
          <div
            style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, gap: S[75] }}
          >
            <UiText variant="title">{name}</UiText>
            <div
              style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: S[75] }}
            >
              <span
                {...dataAttributes({ kbDetailStatus: status })}
                style={{
                  display: 'inline-flex',
                  height: H.tag,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingInline: 10,
                  borderRadius: R.pill,
                  backgroundColor:
                    status === 'internalized'
                      ? colors.ink
                      : status === 'blank'
                        ? colors.fill
                        : colors.card,
                  boxShadow: status === 'fuzzy' ? insetRing(colors.ink, 1.5) : undefined,
                }}
              >
                <UiText
                  variant="labelSm"
                  tone={
                    status === 'internalized' ? 'onInk' : status === 'fuzzy' ? 'ink' : 'tertiary'
                  }
                >
                  {strings.status[status]}
                </UiText>
              </span>
            </div>
          </div>
          <PillAction
            size="sm"
            tone="soft"
            label="✕"
            accessibilityLabel={d.close}
            onPress={onClose}
            data={{ kbDetailClose: '1' }}
          />
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flexGrow: 0,
            flexShrink: 1,
            minHeight: 0,
            overflowY: 'auto',
            paddingInline: S[300],
            paddingBottom: S[300],
            gap: S[200],
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: S[75] }}>
            <PillAction
              tone="solid"
              label={d.go}
              accessibilityLabel={d.goTitle}
              onPress={onGo}
              data={{ kbGo: index }}
            />
            {onPractice ? (
              <PillAction
                label={d.practice}
                accessibilityLabel={d.practiceTitle}
                onPress={onPractice}
                data={{ kbPractice: index }}
              />
            ) : null}
          </div>
          {definition ? (
            <DetailSection label={d.definition} data={{ kbDefinitionSection: '1' }}>
              <UiText variant="bodySm" {...dataAttributes({ kbDefinition: '1' })}>
                {definition}
              </UiText>
            </DetailSection>
          ) : null}
          <DetailSection label={d.systemNote}>
            <UiText
              variant="bodySm"
              tone={node.system_note ? 'ink' : 'tertiary'}
              {...dataAttributes({ kbSystemNote: '1' })}
            >
              {node.system_note || d.noSystemNote}
            </UiText>
          </DetailSection>
          <DetailSection label={d.confidence}>
            <ConfidenceSteps value={confidence} strings={strings} onChange={onConfidence} />
          </DetailSection>
          <DetailSection label={d.connections}>
            {concepts.length ? (
              concepts.map((relation) => (
                <div
                  key={`c-${relation.index}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: S[75],
                    padding: S[100],
                    borderRadius: R.row,
                    backgroundColor: sheets(colors).subtle,
                    boxShadow: insetRing(colors.hairline),
                  }}
                  {...dataAttributes({ kbRelation: 'concept', kbRelationTo: relation.index })}
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
                    {relation.relation ? (
                      <UiText variant="labelSm" tone="tertiary">
                        {relation.relation}
                      </UiText>
                    ) : null}
                    <PillAction
                      size="sm"
                      label={relation.name}
                      accessibilityLabel={fill(d.open, { name: relation.name })}
                      onPress={() => onSelect(relation.index)}
                      chevron={false}
                    />
                  </div>
                  <UiText
                    variant="labelSm"
                    tone="secondary"
                    style={{ fontWeight: '400' }}
                    {...dataAttributes({ kbRelationWhy: '1' })}
                  >
                    {relation.why}
                  </UiText>
                </div>
              ))
            ) : relations.length ? (
              relations.map((relation) => (
                <div
                  key={relation.role}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: S[75],
                    padding: S[100],
                    borderRadius: R.row,
                    backgroundColor: sheets(colors).subtle,
                    boxShadow: insetRing(colors.hairline),
                  }}
                  {...dataAttributes({ kbRelation: relation.role })}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: S[75],
                    }}
                  >
                    <UiText variant="labelSm" tone="tertiary">
                      {relation.role === 'before' ? d.before : d.after}
                    </UiText>
                    <PillAction
                      size="sm"
                      label={relation.name}
                      accessibilityLabel={fill(d.open, { name: relation.name })}
                      onPress={() => onSelect(relation.index)}
                      chevron={false}
                    />
                  </div>
                  <UiText variant="labelSm" tone="secondary" style={{ fontWeight: '400' }}>
                    {relation.role === 'before'
                      ? fill(d.whyBefore, { a: relation.name, b: name })
                      : fill(d.whyAfter, { a: name, b: relation.name })}
                  </UiText>
                </div>
              ))
            ) : (
              <UiText variant="labelSm" tone="tertiary">
                {d.noConnections}
              </UiText>
            )}
          </DetailSection>
          <DetailSection label={d.yourNote}>
            <textarea
              key={index}
              rows={3}
              aria-label={d.yourNote}
              placeholder={d.notePlaceholder}
              defaultValue={node.user_note || ''}
              onChange={(event) => onNote(event.currentTarget.value)}
              {...dataAttributes({ kbUserNote: index })}
              style={{
                minHeight: 72,
                border: 0,
                boxShadow: insetRing(colors.hairlineStrong),
                borderRadius: R.row,
                paddingInline: S[100],
                paddingBlock: S[75],
                color: colors.ink,
                fontFamily,
                fontSize: 14,
                lineHeight: '22px',
                resize: 'vertical',
              }}
            />
          </DetailSection>
          <DetailSection label={d.history}>
            {history.length ? (
              <HistoryRows rows={history} label={d.history} />
            ) : (
              <UiText variant="labelSm" tone="tertiary">
                {d.noHistory}
              </UiText>
            )}
          </DetailSection>
        </div>
      </div>
    </div>
  );
}

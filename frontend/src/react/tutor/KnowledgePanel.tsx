import { useEffect, useState } from 'react';
import { useKbStore, useSessionStore } from '../../store/index.ts';
import type { BoundarySnapshot, KbNode } from '../../state/kb.ts';
import { getCurrentLanguage } from '../../i18n/languageState.ts';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { i18n, t } from '../legacy/gateway.ts';
import { Button } from '../ui/shadcn/button';
import { TutorSnapshotAction } from './TutorSnapshotAction';
import { KnowledgeNodeDetail, type KnowledgeHistoryItem } from './KnowledgeNodeDetail';
import {
  jumpToKnowledgeNode,
  patchKnowledgeNode,
  saveKnowledgeBoundarySnapshot,
  updateKnowledgeNodeNote,
} from '../../ui/knowledgePanelCommands.ts';

const GRAPH_WIDTH = 320;
const GRAPH_HEIGHT = 240;
const GRAPH_PADDING = 26;

interface GraphPosition { x: number; y: number }
let cachedLayoutKey = '';
let cachedLayoutPositions: GraphPosition[] = [];

function layoutKnowledgeNodes(nodes: readonly KbNode[]): GraphPosition[] {
  const count = nodes.length;
  const centerX = GRAPH_WIDTH / 2;
  const centerY = GRAPH_HEIGHT / 2;
  const radius = Math.min(GRAPH_WIDTH, GRAPH_HEIGHT) / 2 - GRAPH_PADDING - 6;
  const positions = nodes.map((_, index) => {
    const angle = (2 * Math.PI * index) / count - Math.PI / 2;
    return { x: centerX + radius * Math.cos(angle), y: centerY + radius * Math.sin(angle) };
  });
  if (count < 2) {
    if (count === 1) positions[0] = { x: centerX, y: centerY };
    return positions;
  }

  const idealSpacing = Math.max(30, Math.min(GRAPH_WIDTH, GRAPH_HEIGHT) / Math.sqrt(count));
  const iterations = 160;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const temperature = 1 - iteration / iterations;
    const displacement = positions.map(() => ({ x: 0, y: 0 }));
    for (let left = 0; left < count; left += 1) {
      for (let right = left + 1; right < count; right += 1) {
        const dx = positions[left]!.x - positions[right]!.x;
        const dy = positions[left]!.y - positions[right]!.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const force = (idealSpacing * idealSpacing) / distance;
        const ux = dx / distance;
        const uy = dy / distance;
        displacement[left]!.x += ux * force;
        displacement[left]!.y += uy * force;
        displacement[right]!.x -= ux * force;
        displacement[right]!.y -= uy * force;
      }
    }
    for (let edge = 0; edge < count - 1; edge += 1) {
      const dx = positions[edge]!.x - positions[edge + 1]!.x;
      const dy = positions[edge]!.y - positions[edge + 1]!.y;
      const distance = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const force = (distance * distance) / idealSpacing;
      const ux = dx / distance;
      const uy = dy / distance;
      displacement[edge]!.x -= ux * force;
      displacement[edge]!.y -= uy * force;
      displacement[edge + 1]!.x += ux * force;
      displacement[edge + 1]!.y += uy * force;
    }
    for (let index = 0; index < count; index += 1) {
      const node = positions[index]!;
      const force = displacement[index]!;
      force.x += (centerX - node.x) * 0.03;
      force.y += (centerY - node.y) * 0.03;
      const distance = Math.sqrt(force.x * force.x + force.y * force.y) || 0.01;
      const step = Math.min(distance, 8 * temperature + 0.5);
      node.x = Math.max(GRAPH_PADDING, Math.min(GRAPH_WIDTH - GRAPH_PADDING, node.x + (force.x / distance) * step));
      node.y = Math.max(GRAPH_PADDING, Math.min(GRAPH_HEIGHT - GRAPH_PADDING, node.y + (force.y / distance) * step));
    }
  }
  return positions;
}

function knowledgeNodeLayout(nodes: readonly KbNode[]): GraphPosition[] {
  const key = JSON.stringify(nodes.map((node) => [node.name, node.status, node.questions, node.confidence_score]));
  if (key !== cachedLayoutKey) {
    cachedLayoutKey = key;
    cachedLayoutPositions = layoutKnowledgeNodes(nodes);
  }
  return cachedLayoutPositions;
}

function normalizedStatus(status: string | undefined): 'internalized' | 'fuzzy' | 'blank' {
  return status === 'internalized' || status === 'fuzzy' ? status : 'blank';
}

function statusLabel(status: string | undefined): string {
  const normalized = normalizedStatus(status);
  const fallback = normalized === 'internalized' ? '已内化'
    : normalized === 'fuzzy' ? '模糊' : '空白';
  return i18n(`tutor.status${normalized[0]!.toUpperCase()}${normalized.slice(1)}`, fallback);
}

function stageLabel(stage: string): string {
  const labels: Record<string, { key: string; zh: string; en: string }> = {
    motivate: { key: 'tutor.stageMotivate', zh: '建立直觉', en: 'Intuition' },
    define: { key: 'tutor.stageDefine', zh: '精确定义', en: 'Definition' },
    develop: { key: 'tutor.stageDevelop', zh: '深入推导', en: 'Development' },
    illustrate: { key: 'tutor.stageIllustrate', zh: '应用示例', en: 'Worked example' },
    exercise: { key: 'tutor.stageExercise', zh: '动手练习', en: 'Practice' },
    check: { key: 'tutor.stageCheck', zh: '阶段检查', en: 'Check' },
  };
  const selected = labels[stage] || labels.motivate!;
  return i18n(selected.key, getCurrentLanguage() === 'zh' ? selected.zh : selected.en);
}

function useLanguageRevision(): number {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision((current) => current + 1);
    document.addEventListener('socrates:langchange', refresh);
    return () => document.removeEventListener('socrates:langchange', refresh);
  }, []);
  return revision;
}

function KnowledgeGraph({
  onSelect,
  languageRevision,
}: {
  onSelect: (index: number) => void;
  languageRevision: number;
}) {
  const nodes = useKbStore((snapshot) => snapshot.kbNodes);
  const currentNode = useKbStore((snapshot) => snapshot.currentNode);
  const positions = knowledgeNodeLayout(nodes);
  void languageRevision;
  if (nodes.length === 0) return null;

  return (
    <div className="kb-graph-wrap">
      <div className="kb-graph-caption">
        {getCurrentLanguage() === 'zh'
          ? '知识图谱 · 颜色=掌握度 · 大小=提问数'
          : 'Knowledge map · color = mastery · size = questions'}
      </div>
      <svg
        className="kb-graph"
        viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={getCurrentLanguage() === 'zh' ? '知识点力导向图' : 'Force-directed knowledge graph'}
      >
        <g className="kb-graph-edges">
          {nodes.slice(0, -1).map((_, index) => (
            <line
              key={index}
              x1={positions[index]!.x.toFixed(1)}
              y1={positions[index]!.y.toFixed(1)}
              x2={positions[index + 1]!.x.toFixed(1)}
              y2={positions[index + 1]!.y.toFixed(1)}
            />
          ))}
        </g>
        <g className="kb-graph-nodes">
          {nodes.map((node, index) => {
            const status = normalizedStatus(node.status);
            const questionCount = typeof node.questions === 'number' ? node.questions : 0;
            const radius = Math.max(7, Math.min(22, 7 + Math.sqrt(questionCount) * 4));
            const confidence = typeof node.confidence_score === 'number'
              ? Math.max(0, Math.min(5, node.confidence_score)) : 0;
            const name = node.name || `Node ${index + 1}`;
            const displayName = name.length > 10 ? `${name.slice(0, 9)}…` : name;
            const position = positions[index]!;
            return (
              <g
                className={`kb-graph-node kb-graph-node-${status}${index === currentNode ? ' kb-graph-node-active' : ''}`}
                data-node-idx={index}
                key={`${index}-${name}`}
                tabIndex={0}
                role="button"
                aria-label={name}
                onClick={() => onSelect(index)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(index);
                  }
                }}
              >
                <circle
                  cx={position.x.toFixed(1)}
                  cy={position.y.toFixed(1)}
                  r={radius.toFixed(1)}
                  fillOpacity={0.35 + 0.13 * confidence}
                />
                <text x={position.x.toFixed(1)} y={(position.y + radius + 9).toFixed(1)} textAnchor="middle">{displayName}</text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

function KnowledgeNodeRow({
  node,
  index,
  onSelect,
}: {
  node: KbNode;
  index: number;
  onSelect: (index: number) => void;
}) {
  const status = normalizedStatus(node.status);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={`kb-node kb-node-${status}`}
      data-node-idx={index}
      onClick={() => onSelect(index)}
    >
      <span className={`kb-dot ${status}`} />
      <span className="kb-name">{node.name || `Node ${index + 1}`}</span>
      {status === 'internalized' ? (
        <span className="kb-verify-tag">{i18n('tutor.kbVerifiedTag', '验证 x')}{String(node.verifiedCount || node.questions || 0)}</span>
      ) : null}
      {node.questions ? <span className="kb-count">{i18n('kb.questions', `${node.questions} questions`).replace('{n}', String(node.questions))}</span> : null}
    </Button>
  );
}

function KnowledgeSections({ onSelect, languageRevision }: { onSelect: (index: number) => void; languageRevision: number }) {
  const nodes = useKbStore((snapshot) => snapshot.kbNodes);
  void languageRevision;
  const groups = [
    { key: 'internalized', title: i18n('tutor.kbSectionInternalized', '已内化') },
    { key: 'fuzzy', title: i18n('tutor.kbSectionFuzzy', '模糊') },
    { key: 'blank', title: i18n('tutor.kbSectionBlank', '未探测') },
  ] as const;
  return (
    <>
      {groups.map((group) => {
        const entries = nodes.flatMap((node, index) => normalizedStatus(node.status) === group.key ? [{ node, index }] : []);
        if (entries.length === 0) return null;
        return (
          <section key={group.key}>
            <div className="kb-section-title">
              {group.title} <span className="kb-section-count">{entries.length}</span>
            </div>
            {entries.map(({ node, index }) => (
              <div key={`${index}-${node.name}`}>
                <KnowledgeNodeRow node={node} index={index} onSelect={onSelect} />
                {group.key === 'fuzzy' && node.system_note ? (
                  <div className="kb-node-system-note"><span className="kb-tag-system">[系统]</span> {node.system_note}</div>
                ) : null}
                {group.key === 'fuzzy' && node.user_note ? (
                  <div className="kb-node-user-note"><span className="kb-tag-user">[我]</span> {node.user_note}</div>
                ) : null}
              </div>
            ))}
          </section>
        );
      })}
    </>
  );
}

function formatBoundaryDate(item: BoundarySnapshot): string {
  if (item.date) return String(item.date);
  if (typeof item.at !== 'number') return '';
  try { return new Date(item.at).toISOString().slice(0, 10); }
  catch (error) {
    reportSwallow(error, 'react/tutor/KnowledgePanel.formatBoundaryDate');
    return '';
  }
}

function boundaryHistoryItems(history: BoundarySnapshot[]): KnowledgeHistoryItem[] {
  return history.slice(-8).reverse().map((item) => {
    return { date: formatBoundaryDate(item), summary: String(item.summary || '') };
  });
}

export function KnowledgeMapPanel() {
  const nodes = useKbStore((snapshot) => snapshot.kbNodes);
  const history = useKbStore((snapshot) => snapshot.boundariesHistory);
  const sessionId = useSessionStore((snapshot) => snapshot.currentSessionId);
  const languageRevision = useLanguageRevision();
  const [selection, setSelection] = useState<{ index: number; sessionId: string | null } | null>(null);
  void languageRevision;

  const selectedIndex = selection?.sessionId === sessionId ? selection.index : null;
  const activeNode = selectedIndex !== null ? nodes[selectedIndex] : undefined;
  if (nodes.length === 0) {
    return <div className="kb-empty">{i18n('tutor.kbTopicFirst', 'Set a topic to build your knowledge map.')}</div>;
  }

  const chooseNode = (index: number) => {
    setSelection((current) => current?.sessionId === sessionId && current.index === index
      ? null
      : { index, sessionId });
  };
  const detailHistory = boundaryHistoryItems(history);
  return (
    <>
      <div className="kb-file-header">
        <div className="kb-file-title">{i18n('tutor.kbFileTitle', '知识边界')}</div>
        <div className="kb-file-meta">{i18n('tutor.kbLastUpdated', '最后更新')}: {new Date().toISOString().slice(0, 10)}</div>
        <TutorSnapshotAction label={i18n('tutor.kbSnapshot', '存档当前版本')} onClick={saveKnowledgeBoundarySnapshot} />
      </div>
      <KnowledgeGraph onSelect={chooseNode} languageRevision={languageRevision} />
      {activeNode && selectedIndex !== null ? (
        <div className="kb-node-detail" data-node-idx={selectedIndex}>
          <KnowledgeNodeDetail
            index={selectedIndex}
            status={normalizedStatus(activeNode.status)}
            statusLabel={statusLabel(activeNode.status)}
            goLabel={t('kb.go')}
            goTitle={t('kb.goTitle')}
            confidenceLabel={t('kb.confidence')}
            confidenceSetLabel={(value) => t('kb.confidenceSet').replace('{n}', String(value))}
            confidenceScore={typeof activeNode.confidence_score === 'number' ? activeNode.confidence_score : 0}
            systemNoteLabel={t('kb.systemNote')}
            systemNote={activeNode.system_note || ''}
            noSystemNote={t('kb.noSystemNote')}
            userNoteLabel={t('kb.yourNote')}
            userNote={activeNode.user_note || ''}
            userNotePlaceholder={t('kb.placeholderNote')}
            historyLabel={t('kb.history')}
            history={detailHistory}
            noHistory={t('kb.noHistory')}
            onGo={() => { void jumpToKnowledgeNode(selectedIndex); }}
            onConfidenceChange={(value) => patchKnowledgeNode(selectedIndex, { confidence_score: value })}
            onUserNoteChange={(value) => updateKnowledgeNodeNote(selectedIndex, value)}
          />
        </div>
      ) : null}
      <KnowledgeSections onSelect={chooseNode} languageRevision={languageRevision} />
      {history.length ? (
        <>
          <div className="kb-section-title kb-section-title-secondary">{i18n('tutor.kbHistory', '存档历史')}</div>
          <ul className="kb-history-list">
            {history.slice(-8).reverse().map((item, index) => {
              const date = formatBoundaryDate(item);
              return (
                <li className="kb-history-item" key={`${date}-${index}`}>
                  <span className="kb-history-date">{date}</span>
                  <span className="kb-history-summary">{item.summary || ''}</span>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </>
  );
}

export function TeachingPlanPanel() {
  const plan = useSessionStore((snapshot) => snapshot.teachingPlan);
  const stage = useSessionStore((snapshot) => snapshot.teachingStage);
  const substantiveCount = useSessionStore((snapshot) => snapshot.substantiveCount);
  const revision = useLanguageRevision();
  void revision;
  if (!plan?.subtopics.length) return null;

  const currentIndex = plan.currentSubtopicIdx || 0;
  const doneCount = plan.subtopics.filter((subtopic) => subtopic.status === 'internalized').length;
  const totalCount = plan.subtopics.length;
  const percent = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;
  return (
    <div className="teaching-plan">
      <div className="teaching-plan-title">{i18n('tutor.planTitle', '教学计划')}</div>
      <div className="teaching-plan-progress">
        <div className="teaching-plan-progress-bar">
          <div className="teaching-plan-progress-fill" style={{ width: `${percent}%` }} />
        </div>
        <div className="teaching-plan-progress-text">{doneCount} / {totalCount} ({percent}%)</div>
      </div>
      {plan.subtopics.map((subtopic, index) => {
        const isCurrent = index === currentIndex && subtopic.status !== 'internalized';
        const isDone = subtopic.status === 'internalized';
        const normalized = normalizedStatus(subtopic.status);
        return (
          <div className={`teaching-plan-subtopic${isCurrent ? ' current' : ''}${isDone ? ' done' : ''}`} key={`${index}-${subtopic.name}`}>
            <span className="teaching-plan-marker">{isDone ? i18n('tutor.done', '[done]') : isCurrent ? '›' : '·'}</span>
            <span className="teaching-plan-name">{subtopic.name}</span>
            <span className={`teaching-plan-status status-${normalized}`}>{statusLabel(subtopic.status)}</span>
            {isCurrent ? (
              <>
                <span className="teaching-plan-stage">{stageLabel(stage)}</span>
                <span
                  className="teaching-plan-depth"
                  title={i18n('tutor.depthHint', 'Reach 3 in-depth answers to advance to the next sub-topic')}
                >{Math.min(substantiveCount || 0, 3)}/3</span>
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

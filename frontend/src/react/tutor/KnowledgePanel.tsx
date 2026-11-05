import { useEffect, useState, useSyncExternalStore } from 'react';
import { KnowledgeMap, defaultKnowledgeStrings, type KnowledgeStrings } from '@socrates/ui/study';
import { useKbStore, useSessionStore } from '../../store/index.ts';
import { getCurrentLanguage } from '../../i18n/languageState.ts';
import { i18n } from '../legacy/gateway.ts';
import { WebUiTheme, useLocaleRefresh } from '../rn/WebUiTheme';
import {
  jumpToKnowledgeNode,
  patchKnowledgeNode,
  saveKnowledgeBoundarySnapshot,
  updateKnowledgeNodeNote,
} from '../../ui/knowledgePanelCommands.ts';
import { getConceptMapStatus, subscribeConceptMapStatus } from '../../tutor/conceptMap.ts';
import { practiceKnowledgeNode } from '../../tutor/knowledgePractice.ts';

function normalizedStatus(status: string | undefined): 'internalized' | 'fuzzy' | 'blank' {
  return status === 'internalized' || status === 'fuzzy' ? status : 'blank';
}

function statusLabel(status: string | undefined): string {
  const normalized = normalizedStatus(status);
  const fallback = normalized === 'internalized' ? '自评较熟悉'
    : normalized === 'fuzzy' ? '尚有疑问' : '未评估';
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

function knowledgeStrings(): KnowledgeStrings {
  const d = defaultKnowledgeStrings;
  return {
    title: i18n('tutor.kbFileTitle', '知识边界'),
    lastUpdated: i18n('tutor.kbLastUpdated', '最后更新'),
    snapshot: i18n('tutor.kbSnapshot', '存档当前版本'),
    graphLabel: i18n('kb.graphLabel', d.graphLabel),
    captionMastery: i18n('kb.captionMastery', d.captionMastery),
    caption: i18n('kb.caption', d.caption),
    captionConcepts: i18n('kb.captionConcepts', d.captionConcepts),
    updating: i18n('kb.updating', d.updating),
    updateFailed: i18n('kb.updateFailed', d.updateFailed),
    status: { internalized: statusLabel('internalized'), fuzzy: statusLabel('fuzzy'), blank: statusLabel('blank') },
    section: {
      internalized: i18n('tutor.kbSectionInternalized', '自评较熟悉'),
      fuzzy: i18n('tutor.kbSectionFuzzy', '尚有疑问'),
      blank: i18n('tutor.kbSectionBlank', '未评估'),
    },
    zoomIn: i18n('kb.zoomIn', d.zoomIn),
    zoomOut: i18n('kb.zoomOut', d.zoomOut),
    zoomFit: i18n('kb.zoomFit', d.zoomFit),
    recordedTag: `${i18n('tutor.kbRecordedTag', '记录 ×')}{n}`,
    questions: i18n('kb.questions', d.questions),
    systemTag: i18n('kb.systemTag', d.systemTag),
    userTag: i18n('kb.userTag', d.userTag),
    history: i18n('tutor.kbHistory', '存档历史'),
    empty: i18n('tutor.kbTopicFirst', d.empty),
    detail: {
      close: i18n('kb.close', d.detail.close),
      go: i18n('kb.go', d.detail.go),
      goTitle: i18n('kb.goTitle', d.detail.goTitle),
      confidence: i18n('kb.confidence', d.detail.confidence),
      confidenceSet: i18n('kb.confidenceSet', d.detail.confidenceSet),
      definition: i18n('kb.definition', d.detail.definition),
      practice: i18n('kb.practice', d.detail.practice),
      practiceTitle: i18n('kb.practiceTitle', d.detail.practiceTitle),
      systemNote: i18n('kb.systemNote', d.detail.systemNote),
      noSystemNote: i18n('kb.noSystemNote', d.detail.noSystemNote),
      yourNote: i18n('kb.yourNote', d.detail.yourNote),
      notePlaceholder: i18n('kb.placeholderNote', d.detail.notePlaceholder),
      history: i18n('kb.history', d.detail.history),
      noHistory: i18n('kb.noHistory', d.detail.noHistory),
      connections: i18n('kb.connections', d.detail.connections),
      noConnections: i18n('kb.noConnections', d.detail.noConnections),
      before: i18n('kb.before', d.detail.before),
      after: i18n('kb.after', d.detail.after),
      whyBefore: i18n('kb.whyBefore', d.detail.whyBefore),
      whyAfter: i18n('kb.whyAfter', d.detail.whyAfter),
      open: i18n('kb.open', d.detail.open),
    },
  };
}

/** RN-5: the map, list and node detail are the shared RN panel
 * (packages/ui/src/study); this adapter wires the KB store and commands. */
export function KnowledgeMapPanel() {
  const nodes = useKbStore((snapshot) => snapshot.kbNodes);
  const currentNode = useKbStore((snapshot) => snapshot.currentNode);
  const history = useKbStore((snapshot) => snapshot.boundariesHistory);
  const sessionId = useSessionStore((snapshot) => snapshot.currentSessionId);
  const conceptStatus = useSyncExternalStore(subscribeConceptMapStatus, getConceptMapStatus);
  useLocaleRefresh();
  return (
    <WebUiTheme>
      <KnowledgeMap
        key={sessionId ?? 'none'}
        nodes={nodes}
        currentNode={currentNode}
        history={history}
        updatedLabel={new Date().toISOString().slice(0, 10)}
        strings={knowledgeStrings()}
        onSnapshot={saveKnowledgeBoundarySnapshot}
        onGo={(index) => { void jumpToKnowledgeNode(index); }}
        onConfidence={(index, value) => patchKnowledgeNode(index, { confidence_score: value })}
        onNote={(index, value) => updateKnowledgeNodeNote(index, value)}
        onPractice={(index) => { void practiceKnowledgeNode(index); }}
        conceptStatus={conceptStatus}
      />
    </WebUiTheme>
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
  const totalCount = plan.subtopics.length;
  /* The path tracks which topic is active; discussion count is not a mastery
     percentage. Self-reported familiarity remains a separate status below. */
  const currentCount = totalCount ? Math.min(totalCount, Math.max(1, currentIndex + 1)) : 0;
  const percent = totalCount ? Math.round((currentCount / totalCount) * 100) : 0;
  const progressText = i18n('tutor.planProgress', 'Topic {current} of {total}')
    .replace('{current}', String(currentCount)).replace('{total}', String(totalCount));
  return (
    <div className="teaching-plan">
      <div className="teaching-plan-title">{i18n('tutor.planTitle', '教学计划')}</div>
      <div className="teaching-plan-progress">
        <div className="teaching-plan-progress-bar">
          <div className="teaching-plan-progress-fill" style={{ width: `${percent}%` }} />
        </div>
        <div className="teaching-plan-progress-text" aria-label={progressText}>{progressText}</div>
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

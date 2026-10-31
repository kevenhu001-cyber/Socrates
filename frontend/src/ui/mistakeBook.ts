import { esc, escAttr } from '../render/helpers.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";

interface MistakeOption { letter: string; text: string }
interface MistakeEntry {
  id: string;
  type: string;
  topic: string;
  node?: string;
  nodeIdx?: number;
  q: string;
  options: MistakeOption[];
  correct: string | null;
  userAnswer: string | null;
  judgedAnswer: string | null;
  timestamp: number;
  redoCount: number;
  quizSlotId: string | null;
  resolved?: boolean;
  isResolved?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseMistakeEntry(value: unknown): MistakeEntry | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null;
  const options = Array.isArray(value.options) ? value.options.flatMap((option, index): MistakeOption[] => {
    if (typeof option === 'string') return [{ letter: String.fromCharCode(65 + index), text: option }];
    if (!isRecord(option) || typeof option.text !== 'string') return [];
    return [{ letter: typeof option.letter === 'string' ? option.letter : String.fromCharCode(65 + index), text: option.text }];
  }) : [];
  return {
    id: value.id,
    type: typeof value.type === 'string' ? value.type : 'practice',
    topic: typeof value.topic === 'string' ? value.topic : '',
    node: typeof value.node === 'string' ? value.node : undefined,
    nodeIdx: typeof value.nodeIdx === 'number' ? value.nodeIdx : undefined,
    q: typeof value.q === 'string' ? value.q : '',
    options,
    correct: typeof value.correct === 'string' ? value.correct : null,
    userAnswer: typeof value.userAnswer === 'string' ? value.userAnswer : null,
    judgedAnswer: typeof value.judgedAnswer === 'string' ? value.judgedAnswer : null,
    timestamp: typeof value.timestamp === 'number' ? value.timestamp : 0,
    redoCount: typeof value.redoCount === 'number' ? value.redoCount : 0,
    quizSlotId: typeof value.quizSlotId === 'string' ? value.quizSlotId : null,
    resolved: value.resolved === true,
    isResolved: value.isResolved === true,
  };
}

function readMistakes(stateStore: MistakeStore): MistakeEntry[] {
  const value = stateStore.read('mistakes');
  return Array.isArray(value) ? value.flatMap((entry) => {
    const parsed = parseMistakeEntry(entry);
    return parsed ? [parsed] : [];
  }) : [];
}

type MistakeStore = typeof import('../state/store.ts')['stateStore'];
interface MistakeBookOptions {
  stateStore: MistakeStore;
  apiFetch: typeof import('../util/api.ts')['apiFetch'];
  saveCurrentSession: typeof import('../session/persistence.ts')['saveCurrentSession'];
  appendAssistantMessage: typeof import('../chat/messages.ts')['addAssistantUiMessage'];
}


/* P_mistakes-i18n — this panel shipped raw English literals while zh is
   the default locale, and echoed the internal mistake.type enum straight
   into the card meta. i18n.ts's t() does no interpolation, so {n} is
   substituted here, matching the convention in ui/diagnosticQuestion.ts. */
function t(key: string, vars?: Record<string, string | number> | undefined) {
  const v = (typeof window !== 'undefined' && typeof browserWindow.t === 'function') ? browserWindow.t(key) : key;
  if (!vars) return v;
  return String(v).replace(/\{(\w+)\}/g, function (whole, name) {
    return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole;
  });
}

function updateMistakeRedoState(stateStore: MistakeStore, mistakeId: string): MistakeEntry | null {
  const mistakes = readMistakes(stateStore);
  const mistake = mistakes.find(function (item) { return item.id === mistakeId; });
  if (!mistake) return null;
  const updated = Object.assign({}, mistake, { redoCount: (mistake.redoCount || 0) + 1 });
  stateStore.dispatch({
    type: 'state/set', key: 'mistakes',
    value: mistakes.map(function (item) { return item.id === mistakeId ? updated : item; }),
  });
  return updated;
}

function makeRedoSlotId(kind: 'quiz' | 'practice'): string {
  return `redo-${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function redoPrompt(): string {
  return `_${esc(t('mistakes.redoingPrompt'))}_`;
}

function practiceRedoText(mistake: MistakeEntry, slotId: string): string {
  return `${redoPrompt()}\n\n<practice data-practice-id="${escAttr(slotId)}" correct="${escAttr(mistake.correct || '')}"><problem>${esc(mistake.q || '')}</problem></practice>`;
}

function quizRedoText(mistake: MistakeEntry, quizId: string): string {
  const options = mistake.options.map((option) =>
    `<o letter="${escAttr(option.letter)}">${esc(option.text)}</o>`,
  ).join('');
  return `${redoPrompt()}\n\n<quiz data-quiz-id="${escAttr(quizId)}"><q>${esc(mistake.q || '')}</q>${options}<correct>${esc(mistake.correct || '')}</correct></quiz>`;
}

function setMistakeQuizSlotId(stateStore: MistakeStore, mistakeId: string, slotId: string): void {
  const mistakes = readMistakes(stateStore);
  stateStore.dispatch({
    type: 'state/set', key: 'mistakes',
    value: mistakes.map((item) => item.id === mistakeId ? { ...item, quizSlotId: slotId } : item),
  });
}

function appendPracticeRedo(
  mistake: MistakeEntry,
  slotId: string,
  appendAssistantMessage: MistakeBookOptions['appendAssistantMessage'],
  saveCurrentSession: MistakeBookOptions['saveCurrentSession'],
) {
  appendAssistantMessage(practiceRedoText(mistake, slotId));
  saveCurrentSession();
}

function appendQuizRedo(
  mistake: MistakeEntry,
  stateStore: MistakeStore,
  appendAssistantMessage: MistakeBookOptions['appendAssistantMessage'],
  saveCurrentSession: MistakeBookOptions['saveCurrentSession'],
) {
  const quizId = makeRedoSlotId('quiz');
  setMistakeQuizSlotId(stateStore, mistake.id, quizId);
  appendAssistantMessage(quizRedoText(mistake, quizId));
  saveCurrentSession();
}

function performMistakeRedo(dependencies: Pick<MistakeBookOptions, 'stateStore' | 'saveCurrentSession' | 'appendAssistantMessage'>, mistakeId: string) {
  const mistake = updateMistakeRedoState(dependencies.stateStore, mistakeId);
  if (!mistake) return;
  const isPractice = mistake.type === 'practice' || !(mistake.options || []).length;
  if (isPractice) {
    appendPracticeRedo(
      mistake,
      makeRedoSlotId('practice'),
      dependencies.appendAssistantMessage,
      dependencies.saveCurrentSession,
    );
    return;
  }
  appendQuizRedo(
    mistake,
    dependencies.stateStore,
    dependencies.appendAssistantMessage,
    dependencies.saveCurrentSession,
  );
}

/**
 * Owns the mistake-book UI and persistence workflow. The chat controller
 * supplies the few cross-feature actions (session save, scrolling, and quiz
 * mounting) so this module stays independent from the main application file.
 */
export function createMistakeBook({
  stateStore,
  apiFetch,
  saveCurrentSession,
  appendAssistantMessage,
}: MistakeBookOptions) {
  const redoDependencies = {
    stateStore,
    saveCurrentSession,
    appendAssistantMessage,
  };

  function persistMistake(mistakeData: { nodeName: string | null; questionContent: string; userAnswer: string | null; correctAnswer: string | null; source: string }) {
    let sid = stateStore.read('currentSessionId');
    if (typeof sid !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sid)) sid = null;
    try {
      apiFetch('/api/mistakes', {
        method: 'POST',
        body: {
          sessionId: sid,
          nodeName: mistakeData.nodeName || null,
          questionContent: mistakeData.questionContent || '',
          userAnswer: mistakeData.userAnswer != null ? String(mistakeData.userAnswer) : null,
          correctAnswer: mistakeData.correctAnswer != null ? String(mistakeData.correctAnswer) : null,
          source: mistakeData.source || 'quiz',
        },
      }).catch(function (error) {
        reportSwallow(error, 'ui/mistakeBook.persistMistake');
      });
    } catch (error) {
      reportSwallow(error, 'ui/mistakeBook.persistMistakeCatch');
    }
  }

  function recordMistake(rec: Record<string, unknown>) {
    const type = typeof rec.type === 'string' ? rec.type : 'quiz';
    const question = typeof rec.q === 'string' ? rec.q : '';
    const options = Array.isArray(rec.options) ? rec.options as MistakeOption[] : [];
    const correct = typeof rec.correct === 'string' ? rec.correct : null;
    const userAnswer = typeof rec.userAnswer === 'string' ? rec.userAnswer : null;
    const judgedAnswer = typeof rec.judgedAnswer === 'string' ? rec.judgedAnswer : null;
    const quizSlotId = typeof rec.quizSlotId === 'string' ? rec.quizSlotId : null;
    const kbNodes = (stateStore.read('kbNodes') || []) as Array<{ name?: string }>;
    const currentNode = stateStore.read('currentNode');
    const node = kbNodes[currentNode] || {};
    const mistake: MistakeEntry = {
      id: 'm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
      type,
      topic: stateStore.read('topic') || '',
      node: node.name || '',
      nodeIdx: currentNode,
      q: question,
      options,
      correct,
      userAnswer,
      judgedAnswer,
      timestamp: Date.now(),
      redoCount: 0,
      quizSlotId,
    };
    stateStore.dispatch({
      type: 'state/set', key: 'mistakes',
      value: [mistake, ...readMistakes(stateStore)],
    });
    persistMistake({
      nodeName: mistake.node || null,
      questionContent: mistake.q,
      userAnswer: mistake.userAnswer,
      correctAnswer: mistake.correct,
      source: mistake.type === 'practice' ? 'practice' : 'quiz',
    });
    saveCurrentSession();
  }

  function removeMistakeForQuizSlot(slotId: string) {
    const mistakes = readMistakes(stateStore);
    if (!slotId || !mistakes.length) return;
    const before = mistakes.length;
    const remaining = mistakes.filter(function (mistake) { return mistake.quizSlotId !== slotId; });
    if (remaining.length !== before) {
      stateStore.dispatch({ type: 'state/set', key: 'mistakes', value: remaining });
      saveCurrentSession();
    }
  }

  function handleMistakeRedo(mistakeId: string | null) {
    if (!mistakeId) return;
    performMistakeRedo(redoDependencies, mistakeId);
  }

  return { recordMistake, removeMistakeForQuizSlot, redoMistake: handleMistakeRedo };
}

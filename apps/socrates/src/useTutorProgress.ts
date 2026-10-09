import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Message, Session } from '@socrates/contracts';
import { useAuthStore } from '@socrates/auth';
import { useChatStore } from '@socrates/chat';
import {
  assignMistakeQuizSlot,
  bumpMistakeRedo,
  messageQuizSlotId,
  mistakeRedoPlan,
  normalizeMistakes,
  practiceMistakeFor,
  prependMistake,
  quizMistakeFor,
  removeMistakesForQuizSlot,
  type BoundarySnapshot,
  type KnowledgeBoundaryNode,
  type MistakeFilter,
  type MistakeRedoItem,
  type PracticeSubmission,
  type QuizPick,
} from '@socrates/ui';
import { api } from './runtime';
import { appStringsNow } from './strings';
import { uuidScope } from './sessionIdentity';

type RefCell<T> = { current: T };
type RunTurn = (
  sessionId: string,
  text: string,
  messageAttachments: Message['attachments'],
  persistAttachments?: (serverSessionId: string) => Promise<Message['attachments'] | undefined>,
  assistantPrompt?: string,
) => Promise<void>;
type SubmitTurn = (rawText: string, origin: 'composer' | 'quiz' | 'practice') => void;
type RedoState = { sessionId: string | null; items: MistakeRedoItem[]; resets: Record<string, number> };

interface UseTutorProgressOptions {
  active: Session | null;
  activeId: string | null;
  accountEpoch: RefCell<number>;
  runTurn: RunTurn;
  submitTurn: SubmitTurn;
}

function mistakeContextOf(session: Session): { topic: string; node: string; nodeIdx: number | null } {
  const nodeIdx = typeof session.currentNode === 'number' ? session.currentNode : null;
  const node = nodeIdx !== null ? (session.kbNodes as Array<{ name?: string }> | undefined)?.[nodeIdx]?.name : undefined;
  return { topic: session.topic || '', node: node || '', nodeIdx };
}

/** Own Tutor progress, knowledge snapshots, quiz/practice feedback and redo cards. */
export function useTutorProgress({ active, activeId, accountEpoch, runTurn, submitTurn }: UseTutorProgressOptions) {
  const activeMistakes = useMemo(() => active?.mode === 'tutor' ? normalizeMistakes(active.mistakes) : [], [active]);
  const activeMistakeFilter: MistakeFilter = active?.mistakeFilter === 'unresolved' || active?.mistakeFilter === 'resolved' ? active.mistakeFilter : 'all';
  const [redo, setRedo] = useState<RedoState>({ sessionId: null, items: [], resets: {} });
  const tutorSaveQueues = useRef(new Map<string, Promise<void>>());
  const tutorSaveAliases = useRef(new Map<string, string>());

  useEffect(() => {
    setRedo((previous) => {
      if (previous.sessionId === activeId) return previous;
      // An adopted local id is the same transcript; other session switches
      // discard redo cards that belong to the previous transcript.
      const adopted = !!previous.sessionId && !useChatStore.getState().sessions.some((session) => session.id === previous.sessionId);
      return adopted ? { ...previous, sessionId: activeId } : { sessionId: activeId, items: [], resets: {} };
    });
  }, [activeId]);

  const persistTutorPatch = useCallback((sessionId: string, patch: Partial<Session>) => {
    const store = useChatStore.getState();
    store.patchSession(sessionId, patch);
    const owner = useAuthStore.getState().user;
    if (!owner || owner.isGuest) return;
    const epoch = accountEpoch.current;
    const previous = tutorSaveQueues.current.get(sessionId) || Promise.resolve();
    const save = previous.catch(() => undefined).then(async () => {
      if (epoch !== accountEpoch.current) return;
      const resolvedId = tutorSaveAliases.current.get(sessionId) || sessionId;
      const latestStore = useChatStore.getState();
      const latest = latestStore.sessions.find((session) => session.id === resolvedId)
        || latestStore.sessions.find((session) => session.id === sessionId);
      if (!latest) return;
      const saved = await api.sessions.save(latest);
      if (epoch !== accountEpoch.current) return;
      const current = useChatStore.getState().sessions.find((session) => session.id === latest.id);
      if (current) useChatStore.getState().adoptSessionId(latest.id, { ...saved, ...current, id: saved.id });
      tutorSaveAliases.current.set(sessionId, saved.id);
    }).catch(() => { /* Keep the local Tutor edit; the next turn retries its session save. */ });
    tutorSaveQueues.current.set(sessionId, save);
    void save.then(() => {
      if (tutorSaveQueues.current.get(sessionId) === save) tutorSaveQueues.current.delete(sessionId);
    });
  }, [accountEpoch]);

  const setActiveMistakeFilter = useCallback((filter: MistakeFilter) => {
    const store = useChatStore.getState();
    if (store.activeSessionId) store.patchSession(store.activeSessionId, { mistakeFilter: filter });
  }, []);

  const updateKnowledgeNode = useCallback((index: number, patch: Partial<KnowledgeBoundaryNode>) => {
    const session = active;
    if (!session || session.mode !== 'tutor') return;
    const nodes = ((session.kbNodes || []) as unknown as KnowledgeBoundaryNode[]).map((node, nodeIndex) => (
      nodeIndex === index ? { ...node, ...patch } : node
    ));
    persistTutorPatch(session.id, { kbNodes: nodes as unknown as Session['kbNodes'] });
  }, [active, persistTutorPatch]);

  const saveKnowledgeSnapshot = useCallback(() => {
    const session = active;
    if (!session || session.mode !== 'tutor') return;
    const nodes = (session.kbNodes || []) as unknown as KnowledgeBoundaryNode[];
    const counts = { internalized: 0, fuzzy: 0, blank: 0 };
    for (const node of nodes) {
      if (node.status === 'internalized') counts.internalized += 1;
      else if (node.status === 'fuzzy') counts.fuzzy += 1;
      else counts.blank += 1;
    }
    const snapshot: BoundarySnapshot & { counts: typeof counts } = {
      date: new Date().toISOString().slice(0, 10),
      at: Date.now(),
      summary: `I ${counts.internalized} · F ${counts.fuzzy} · B ${counts.blank}`,
      counts,
    };
    const history = [...(session.boundariesHistory || []), snapshot as unknown as NonNullable<Session['boundariesHistory']>[number]].slice(-30);
    persistTutorPatch(session.id, { boundariesHistory: history });
  }, [active, persistTutorPatch]);

  const jumpToKnowledgeNode = useCallback((index: number) => {
    if (!active || active.mode !== 'tutor') return;
    const store = useChatStore.getState();
    if (store.turnId) return;
    const nodes = (active.kbNodes || []) as unknown as KnowledgeBoundaryNode[];
    const node = nodes[index];
    if (!node) return;
    store.patchSession(active.id, { currentNode: index, substantiveCount: 0 });
    const hasHistory = (active.messages || []).some((message) => message.role === 'assistant' && !!(message.rawText || message.content));
    const assistantPrompt = hasHistory
      ? 'Continue the lesson from where we left off.'
      : `I'm ready to begin. Please teach me about ${node.name || active.topic}.`;
    void runTurn(active.id, '', undefined, undefined, assistantPrompt);
  }, [active, runTurn]);

  const mirrorMistake = useCallback((sessionId: string, mistake: ReturnType<typeof quizMistakeFor> | ReturnType<typeof practiceMistakeFor>) => {
    if (!mistake) return;
    const owner = useAuthStore.getState().user;
    if (!owner || owner.isGuest) return;
    void api.mistakes.create({
      sessionId: uuidScope(sessionId),
      nodeName: mistake.node || null,
      questionContent: mistake.q || '',
      userAnswer: mistake.userAnswer,
      correctAnswer: mistake.correct,
      source: mistake.type === 'practice' ? 'practice' : 'quiz',
    }).catch(() => { /* Mirror only; the session save carries the book. */ });
  }, []);

  const onQuizPick = useCallback((pick: QuizPick) => {
    const store = useChatStore.getState();
    const sessionId = store.activeSessionId;
    if (!sessionId) return;
    const session = store.sessions.find((item) => item.id === sessionId);
    if (!session || session.mode !== 'tutor' || store.turnId) return;
    const stage = session.teachingStage || 'motivate';
    const attempts = session.practiceAttempts || 0;
    const right = pick.isRight && !!pick.correct;
    if (stage === 'exercise') {
      store.patchSession(sessionId, right ? { teachingStage: 'check', practiceAttempts: 0 } : { practiceAttempts: attempts + 1 });
    } else if (stage === 'check') {
      store.patchSession(sessionId, { practiceAttempts: right ? 0 : attempts + 1 });
    }
    if (right && pick.slotId) {
      const book = normalizeMistakes(session.mistakes);
      const remaining = removeMistakesForQuizSlot(book, pick.slotId);
      if (remaining !== book) persistTutorPatch(sessionId, { mistakes: remaining as unknown as Session['mistakes'] });
    }
    if (!pick.correct || pick.isRight) return;
    const quizMistake = quizMistakeFor(
      { q: pick.q, options: pick.options, picked: pick.picked, correct: pick.correct, slotId: pick.slotId },
      mistakeContextOf(session),
    );
    if (quizMistake) {
      store.patchSession(sessionId, { mistakes: prependMistake(normalizeMistakes(session.mistakes), quizMistake) as unknown as Session['mistakes'] });
      mirrorMistake(sessionId, quizMistake);
    }
    submitTurn(`I chose ${pick.picked}. ${pick.pickedText} (Result: incorrect, correct is ${pick.correct}.)`, 'quiz');
  }, [mirrorMistake, persistTutorPatch, submitTurn]);

  const onPracticeSubmit = useCallback((submission: PracticeSubmission) => {
    const store = useChatStore.getState();
    const sessionId = store.activeSessionId;
    if (!sessionId) return;
    const session = store.sessions.find((item) => item.id === sessionId);
    if (!session || session.mode !== 'tutor' || store.turnId) return;
    if (submission.correct && submission.isRight) store.patchSession(sessionId, { practiceAttempts: 0 });
    const practiceMistake = practiceMistakeFor(submission, mistakeContextOf(session));
    if (practiceMistake) {
      store.patchSession(sessionId, { mistakes: prependMistake(normalizeMistakes(session.mistakes), practiceMistake) as unknown as Session['mistakes'] });
      mirrorMistake(sessionId, practiceMistake);
    }
    submitTurn(`${appStringsNow().practicePrefix}${submission.answer}`, 'practice');
  }, [mirrorMistake, submitTurn]);

  const onRedoMistake = useCallback((mistakeId: string) => {
    const store = useChatStore.getState();
    const sessionId = store.activeSessionId;
    if (!sessionId) return;
    const session = store.sessions.find((item) => item.id === sessionId);
    if (!session || session.mode !== 'tutor') return;
    const bumped = bumpMistakeRedo(normalizeMistakes(session.mistakes), mistakeId);
    if (!bumped.mistake) return;
    const plan = mistakeRedoPlan(bumped.mistake);
    if (plan.kind === 'quiz' && plan.slotId && (session.messages || []).some((message) => message.role === 'assistant' && messageQuizSlotId(message) === plan.slotId)) {
      persistTutorPatch(sessionId, { mistakes: bumped.list as unknown as Session['mistakes'] });
      const slot = plan.slotId;
      setRedo((previous) => {
        const resets = previous.sessionId === sessionId ? previous.resets : {};
        return { sessionId, items: previous.sessionId === sessionId ? previous.items : [], resets: { ...resets, [slot]: (resets[slot] || 0) + 1 } };
      });
      return;
    }
    const redoId = `redo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    let item: MistakeRedoItem;
    let list = bumped.list;
    if (plan.kind === 'quiz') {
      const slotId = `${redoId}:quiz`;
      list = assignMistakeQuizSlot(list, mistakeId, slotId);
      item = { id: redoId, kind: 'quiz', q: plan.q, options: plan.options, correct: plan.correct, slotId };
    } else {
      item = { id: redoId, kind: 'practice', problem: plan.problem, correct: plan.correct };
    }
    persistTutorPatch(sessionId, { mistakes: list as unknown as Session['mistakes'] });
    setRedo((previous) => previous.sessionId === sessionId
      ? { ...previous, items: [...previous.items, item] }
      : { sessionId, items: [item], resets: {} });
  }, [persistTutorPatch]);

  return {
    activeMistakes,
    activeMistakeFilter,
    setActiveMistakeFilter,
    redo,
    updateKnowledgeNode,
    saveKnowledgeSnapshot,
    jumpToKnowledgeNode,
    onQuizPick,
    onPracticeSubmit,
    onRedoMistake,
  };
}

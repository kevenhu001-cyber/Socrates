import { useCallback, useMemo, useRef, useState } from 'react';
import type { ExamData, Session, TutorData } from '@socrates/contracts';
import { useAuthStore } from '@socrates/auth';
import { useChatStore } from '@socrates/chat';
import { useSettingsStore } from '@socrates/settings';
import {
  applyDiagnosticResults,
  buildColdStartNodes,
  buildTeachingPlanFromKB,
  parseExamQuestions,
  syncCurrentNodeFromTeachingPlan,
  type DiagQuestion,
} from '@socrates/ui';
import { api } from './runtime';
import { buildExamData, generateExamQuestions } from './examGeneration';
import { generateDiagQuestions } from './tutorGeneration';
import { appStringsNow } from './strings';
import type { ExamRunState, ExamSetupInput } from './ExamSetupScreen';
import type { TutorRunState, TutorSetupInput } from './TutorSetupScreen';

interface EpochRef {
  current: number;
}

interface UseLearningSetupOptions {
  active: Session | null;
  accountEpoch: EpochRef;
  onReturnToChat: () => void;
}

/** Own exam/tutor setup, diagnostic submission, and local answer persistence. */
export function useLearningSetup({ active, accountEpoch, onReturnToChat }: UseLearningSetupOptions) {
  const [examRun, setExamRun] = useState<ExamRunState>({ running: false, progress: null, error: null });
  const [tutorRun, setTutorRun] = useState<TutorRunState>({ running: false, progress: null, error: null });
  const examAbort = useRef<AbortController | null>(null);
  const tutorAbort = useRef<AbortController | null>(null);
  const examSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const examData = active?.kind === 'exam' ? (active.examData as ExamData | null | undefined) ?? null : null;
  const examQuestions = useMemo(() => parseExamQuestions(examData), [examData]);
  const isExam = examQuestions.length > 0;

  const tutorData = active?.kind === 'tutor' ? (active.tutorData as TutorData | null | undefined) ?? null : null;
  const tutorQuestions = useMemo(
    () => (Array.isArray(tutorData?.questions) ? (tutorData.questions as unknown as DiagQuestion[]) : []),
    [tutorData],
  );
  const tutorAnswers = useMemo(() => {
    const raw = tutorData?.answers as Record<string, unknown> | undefined;
    const out: Record<number, number> = {};
    if (raw) {
      for (const [key, value] of Object.entries(raw)) {
        const question = Number(key);
        if (Number.isInteger(question) && typeof value === 'number') out[question] = value;
      }
    }
    return out;
  }, [tutorData]);
  const showDiagnostic = !!active && tutorQuestions.length > 0 && tutorData?.submitted !== true;

  const persistDiagnosticAnswers = useCallback((sessionId: string, answers: Record<number, number>) => {
    const current = useChatStore.getState().sessions.find((session) => session.id === sessionId);
    if (!current || current.kind !== 'tutor') return;
    useChatStore.getState().patchSession(sessionId, {
      tutorData: {
        questions: current.tutorData?.questions,
        answers: answers as unknown as TutorData['answers'],
        submitted: false,
      },
    });
  }, []);

  const persistExam = useCallback((sessionId: string, data: ExamData, immediate: boolean) => {
    useChatStore.getState().patchSession(sessionId, { kind: 'exam', examData: data });
    if (examSaveTimer.current) clearTimeout(examSaveTimer.current);
    const save = () => {
      examSaveTimer.current = null;
      void api.sessions.patch(sessionId, { kind: 'exam', examData: data }).catch(() => undefined);
    };
    if (immediate) save();
    else examSaveTimer.current = setTimeout(save, 700);
  }, []);

  const startExamGeneration = useCallback(async (input: ExamSetupInput) => {
    const owner = useAuthStore.getState().user;
    if (!owner || owner.isGuest) {
      setExamRun({ running: false, progress: null, error: appStringsNow().guestSendBlocked });
      return;
    }
    examAbort.current?.abort();
    const controller = new AbortController();
    examAbort.current = controller;
    const epoch = accountEpoch.current;
    setExamRun({ running: true, progress: { done: 0, total: input.count, phase: 'generating' }, error: null });
    try {
      const { questions, lang } = await generateExamQuestions(input, {
        signal: controller.signal,
        onProgress: (progress) => {
          if (epoch === accountEpoch.current) {
            setExamRun((previous) => ({
              ...previous,
              progress: { done: progress.done, total: progress.total, phase: progress.phase },
            }));
          }
        },
      });
      if (epoch !== accountEpoch.current) return;
      const examData = buildExamData(input, questions, lang);
      const id = `session-${Date.now()}`;
      const draft: Session = {
        id,
        title: input.topic,
        topic: input.topic,
        mode: 'chat',
        phase: 'chat',
        kind: 'exam',
        examData,
        messages: [],
      };
      const store = useChatStore.getState();
      store.setSessions([draft, ...store.sessions]);
      store.selectSession(id);
      examAbort.current = null;
      setExamRun({ running: false, progress: null, error: null });
      onReturnToChat();
      try {
        const saved = await api.sessions.save(draft);
        if (epoch === accountEpoch.current) useChatStore.getState().adoptSessionId(id, saved);
      } catch { /* the exam stays local until the next library sync */ }
    } catch {
      if (controller.signal.aborted) {
        if (epoch === accountEpoch.current) setExamRun({ running: false, progress: null, error: null });
        return;
      }
      if (epoch === accountEpoch.current) {
        setExamRun({ running: false, progress: null, error: appStringsNow().examGenerateFailed });
      }
    }
  }, [accountEpoch, onReturnToChat]);

  const cancelExamGeneration = useCallback(() => {
    examAbort.current?.abort();
    examAbort.current = null;
    setExamRun({ running: false, progress: null, error: null });
  }, []);

  const closeExamSetup = useCallback(() => {
    cancelExamGeneration();
    onReturnToChat();
  }, [cancelExamGeneration, onReturnToChat]);

  const startTutorGeneration = useCallback(async (input: TutorSetupInput) => {
    const owner = useAuthStore.getState().user;
    if (!owner || owner.isGuest) {
      setTutorRun({ running: false, progress: null, error: appStringsNow().guestSendBlocked });
      return;
    }
    tutorAbort.current?.abort();
    const controller = new AbortController();
    tutorAbort.current = controller;
    const epoch = accountEpoch.current;
    setTutorRun({ running: true, progress: { done: 0, total: input.count, phase: 'generating' }, error: null });
    try {
      const { questions } = await generateDiagQuestions(
        { topic: input.topic, count: input.count, language: useSettingsStore.getState().language },
        {
          signal: controller.signal,
          onProgress: (progress) => {
            if (epoch === accountEpoch.current) {
              setTutorRun((previous) => ({
                ...previous,
                progress: { done: progress.done, total: progress.total, phase: progress.phase },
              }));
            }
          },
        },
      );
      if (epoch !== accountEpoch.current) return;
      const id = `session-${Date.now()}`;
      const tutorData: TutorData = {
        questions: questions as unknown as TutorData['questions'],
        answers: {},
        submitted: false,
      };
      const draft: Session = {
        id,
        title: input.topic,
        topic: input.topic,
        mode: 'tutor',
        phase: 'chat',
        kind: 'tutor',
        tutorData,
        kbNodes: buildColdStartNodes(input.topic) as unknown as Session['kbNodes'],
        teachingStage: 'motivate',
        currentNode: 0,
        substantiveCount: 0,
        messages: [],
      };
      const store = useChatStore.getState();
      store.setSessions([draft, ...store.sessions]);
      store.selectSession(id);
      tutorAbort.current = null;
      setTutorRun({ running: false, progress: null, error: null });
      onReturnToChat();
      try {
        const saved = await api.sessions.save(draft);
        if (epoch === accountEpoch.current) useChatStore.getState().adoptSessionId(id, saved);
      } catch { /* the tutor session stays local until the next library sync */ }
    } catch {
      if (controller.signal.aborted) {
        if (epoch === accountEpoch.current) setTutorRun({ running: false, progress: null, error: null });
        return;
      }
      if (epoch === accountEpoch.current) {
        setTutorRun({ running: false, progress: null, error: appStringsNow().tutorGenerateFailed });
      }
    }
  }, [accountEpoch, onReturnToChat]);

  const cancelTutorGeneration = useCallback(() => {
    tutorAbort.current?.abort();
    tutorAbort.current = null;
    setTutorRun({ running: false, progress: null, error: null });
  }, []);

  const closeTutorSetup = useCallback(() => {
    cancelTutorGeneration();
    onReturnToChat();
  }, [cancelTutorGeneration, onReturnToChat]);

  const submitDiagnostic = useCallback(async (sessionId: string, answers: Record<number, number>) => {
    const store = useChatStore.getState();
    const session = store.sessions.find((row) => row.id === sessionId);
    const questions = (session?.tutorData?.questions as unknown as DiagQuestion[]) || [];
    if (!session || !questions.length) return;
    const kbNodes = applyDiagnosticResults({
      kbNodes: (session.kbNodes as unknown as Parameters<typeof applyDiagnosticResults>[0]['kbNodes']) || [],
      diagQuestions: questions,
      diagAnswers: questions.map((_, index) => answers[index]),
    });
    const teachingPlan = buildTeachingPlanFromKB(kbNodes);
    const synced = teachingPlan ? syncCurrentNodeFromTeachingPlan(teachingPlan, kbNodes) : null;
    store.patchSession(sessionId, {
      kbNodes: kbNodes as unknown as Session['kbNodes'],
      teachingPlan: (synced ? synced.teachingPlan : teachingPlan) as unknown as Session['teachingPlan'],
      currentNode: synced ? synced.currentNode : 0,
      teachingStage: 'motivate',
      substantiveCount: 0,
      tutorData: {
        questions: session.tutorData?.questions,
        answers: answers as unknown as TutorData['answers'],
        submitted: true,
      },
    });
    try {
      const updated = useChatStore.getState().sessions.find((row) => row.id === sessionId);
      if (updated) await api.sessions.save(updated);
    } catch { /* the plan stays local until the next turn save */ }
  }, []);

  const reset = useCallback(() => {
    examAbort.current?.abort();
    examAbort.current = null;
    setExamRun({ running: false, progress: null, error: null });
    tutorAbort.current?.abort();
    tutorAbort.current = null;
    setTutorRun({ running: false, progress: null, error: null });
  }, []);

  return {
    examRun,
    tutorRun,
    examData,
    isExam,
    tutorQuestions,
    tutorAnswers,
    showDiagnostic,
    persistDiagnosticAnswers,
    persistExam,
    startExamGeneration,
    cancelExamGeneration,
    closeExamSetup,
    startTutorGeneration,
    cancelTutorGeneration,
    closeTutorSetup,
    submitDiagnostic,
    reset,
  };
}

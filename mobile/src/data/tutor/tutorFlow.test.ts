import { buildAssistantModeInstruction } from '../chat/prompts';
import {
  applyDiagnosticResults,
  buildTeachingPlan,
  buildTutorApplicationPrompt,
  nextTeachingStage,
  type TutorDiagnosticQuestion,
  type TutorKnowledgeNode,
} from './tutorFlow';

describe('native prompt parity', () => {
  test('chat tone is injected only when a non-default preset is selected', () => {
    const normal = buildAssistantModeInstruction('hello', 'medium', 'default');
    const efficient = buildAssistantModeInstruction('hello', 'medium', 'efficient');

    expect(normal).not.toContain('## VOICE (tone and register)');
    expect(efficient).toContain('## VOICE (tone and register)');
    expect(efficient).toContain('You are direct and efficient.');
  });

  test('high reasoning hides model thinking from the user-facing message', () => {
    const prompt = buildAssistantModeInstruction('explain this', 'high', 'default');
    expect(prompt).toContain('Do not emit <think> blocks or reasoning_content');
  });
});

describe('Tutor cold-start parity', () => {
  const nodes: TutorKnowledgeNode[] = [
    { name: 'A', status: 'blank' },
    { name: 'B', status: 'blank' },
  ];
  const questions: TutorDiagnosticQuestion[] = [
    {
      q: 'Q1',
      knowledgePoint: 'A1',
      subarea: 'A',
      nodeIdx: 0,
      opts: [
        { letter: 'A', text: 'strong', level: 'internalized' },
        { letter: 'B', text: 'fuzzy', level: 'fuzzy' },
        { letter: 'C', text: 'blank', level: 'blank' },
      ],
    },
    {
      q: 'Q2',
      knowledgePoint: 'B1',
      subarea: 'B',
      nodeIdx: 1,
      opts: [
        { letter: 'A', text: 'strong', level: 'internalized' },
        { letter: 'B', text: 'fuzzy', level: 'fuzzy' },
        { letter: 'C', text: 'blank', level: 'blank' },
      ],
    },
  ];

  test('a strong diagnostic answer is a depth cue, never mastery', () => {
    const result = applyDiagnosticResults(nodes, questions, [0, 2]);
    expect(result[0].status).toBe('fuzzy');
    expect(result[1].status).toBe('blank');
    expect(result[0].system_note).toContain('A1');
  });

  test('teaching plan prioritizes blank nodes before fuzzy nodes', () => {
    const result = applyDiagnosticResults(nodes, questions, [0, 2]);
    const plan = buildTeachingPlan(result);
    expect(plan?.subtopics.map((item) => item.name)).toEqual(['B', 'A']);
  });

  test('stage order matches the SPA state machine', () => {
    expect(nextTeachingStage('motivate')).toBe('define');
    expect(nextTeachingStage('define')).toBe('develop');
    expect(nextTeachingStage('develop')).toBe('illustrate');
    expect(nextTeachingStage('illustrate')).toBe('exercise');
    expect(nextTeachingStage('exercise')).toBe('check');
    expect(nextTeachingStage('check')).toBe('check');
  });

  test('Tutor prompt includes stage scope and tone voice', () => {
    const prompt = buildTutorApplicationPrompt(
      'calculus',
      { name: 'limits', status: 'blank' },
      'exercise',
      { first: false, latestAnswer: 'I think the limit is zero.', tone: 'professional' },
    );
    expect(prompt).toContain('exactly one transfer practice problem');
    expect(prompt).toContain('## VOICE (tone and register)');
    expect(prompt).toContain('formal, precise register');
  });
});

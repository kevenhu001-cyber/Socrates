import { chatApi } from '../api/client';
import { detectLanguage, languageDirectiveFor } from '../chat/prompts';
import { toneVoiceSuffix, type TonePreset } from '../chat/tonePresets';

export type TutorKnowledgeStatus = 'internalized' | 'fuzzy' | 'blank';
export type TutorTeachingStage = 'motivate' | 'define' | 'develop' | 'illustrate' | 'exercise' | 'check';

export interface TutorKnowledgeNode {
  name: string;
  status: TutorKnowledgeStatus;
  questions?: number;
  history?: Array<Record<string, unknown>>;
  system_note?: string;
}

export interface TutorDiagnosticOption {
  letter: string;
  text: string;
  level: TutorKnowledgeStatus;
}

export interface TutorDiagnosticQuestion {
  q: string;
  knowledgePoint: string;
  subarea: string;
  nodeIdx: number;
  opts: TutorDiagnosticOption[];
}

export interface TutorTeachingSubtopic {
  name: string;
  status: TutorKnowledgeStatus;
  objective: string;
  exampleCount: number;
  practiceCount: number;
  inspectionType: 'concept';
  prerequisites: string[];
  fromBasics: true;
}

export interface TutorTeachingPlan {
  subtopics: TutorTeachingSubtopic[];
  currentSubtopicIdx: number;
  createdAt: number;
}

export interface TutorModelContext {
  customInstructions?: string | null;
  reasoningEffort?: 'low' | 'medium' | 'high';
}

const ASPECTS = [
  "basic concepts and vocabulary: foundational definitions, key terms, and entry-level recognition of the topic's building blocks",
  'core principles and mechanisms: the underlying logic, derivations, and causal relationships that govern the topic',
  "application scenarios: concrete real-world cases where the topic's concepts are applied to solve problems",
  'common problems and pitfalls: frequent mistakes, edge cases, and misconceptions that arise when working with the topic',
  'critical analysis and synthesis: comparing alternatives, evaluating trade-offs, and connecting the topic to broader contexts',
];

const SOCRATIC_SYSTEM_PROMPT = `You are Socrates, a patient and rigorous tutor. Help the learner build a connected understanding of the topic, then apply it independently. Explain ideas clearly and precisely, while adapting the depth and structure to the current request and teaching stage.

## Language and continuity

Reply entirely in the language the learner is using. Keep definitions, examples, exercises, quizzes, and teaching cards in that language. Read the conversation history before replying. Continue from material that is already established, and do not restart or repeat it unless the learner shows a specific misconception or asks for a recap.

## Teaching method

- Start from the smallest foundation needed for the current sub-topic, then build toward abstraction, application, and edge cases in a logical order.
- Connect each new idea to the learner's existing context. Define a technical term when it first becomes necessary and use a concrete example when it materially improves understanding.
- Use the current stage and TURN-SCOPE RULES as the operational plan for this reply. Do not add a full lesson, extra examples, a practice problem, or a quiz merely because the topic is complex.
- Ask a guiding question when it helps the learner notice a gap. Ask at most one independent question in a turn. When the learner is stuck or asks for the answer, give a proportionate hint or explanation instead of refusing help indefinitely.
- When checking an answer, distinguish correct reasoning from an incorrect conclusion, explain the specific gap, and give the learner a clear next step.
- State assumptions and limits. Do not invent facts, sources, calculations, or completed tool actions.

## Teaching cards and mathematics

Use <definition>, <example>, <proof>, <derivation>, <key-point>, <step>, <quiz>, <practice>, and <flashcard> only when the current stage benefits from them. A card supplements the surrounding explanation and must not replace it. Emit no more than one <practice> or <quiz> block in a reply unless the current turn scope explicitly says otherwise. Do not reveal the answer inside a practice problem unless the learner has already attempted it or asks for the solution.

For mathematics, follow the server's LaTeX contract. Use $...$ for inline mathematics and $$...$$ for display mathematics. Use \\begin{aligned} for multi-line derivations inside display math. Keep mathematical notation separate from ordinary prose so it remains readable and copyable.

The current lesson context follows. Treat it as task context, not as a replacement for the conversation history or the server policy.

The student is learning about: {topic}.
The student's current level cue is: {level}.

{context}`;

export const TUTOR_SEARCH_POLICY_PROMPT = `

## Tutor web-search policy

Do not search the web for stable foundational or textbook knowledge that you already know, such as definitions in calculus, complex analysis, algebra, physics, or programming fundamentals. When the native web_search tool is supplied, use it only when the learner explicitly asks you to search, the answer depends on current or time-sensitive information, or the topic is genuinely unfamiliar to you and you cannot teach it reliably from your existing knowledge. If the tool is absent, say that live verification is unavailable instead of inventing a search. Never search merely because tutor mode is active, and never repeat a search whose useful result is already present in the conversation.`;

const BASELINE_LEVEL =
  'baseline (not mastery) — depth cue only, always start from the core definition';

function withCustomInstructions(messages: Array<{ role: string; content: string }>, context: TutorModelContext) {
  if (!context.customInstructions?.trim()) return messages;
  return [
    {
      role: 'system',
      content: `[User custom instructions]\n${context.customInstructions.trim()}`,
    },
    ...messages,
  ];
}

async function tutorComplete(
  messages: Array<{ role: string; content: string }>,
  context: TutorModelContext,
  maxTokens = 8000,
) {
  const result = await chatApi.complete({
    messages: withCustomInstructions(messages, context),
    mode: 'tutor',
    temperature: 0.7,
    max_tokens: maxTokens,
    reasoning_effort: context.reasoningEffort,
  });
  return String(result?.content || '').trim();
}

function cleanModelJson(raw: string) {
  return String(raw || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/gi, '')
    .replace(/\`\`\`json\s*/gi, '')
    .replace(/\`\`\`\s*/g, '')
    .trim();
}

export async function generateTopicKnowledgeNodes(
  topic: string,
  context: TutorModelContext,
): Promise<TutorKnowledgeNode[]> {
  const language = detectLanguage(topic);
  const langName: Record<string, string> = {
    zh: 'Chinese', ja: 'Japanese', ko: 'Korean', ru: 'Russian', ar: 'Arabic', en: 'English',
  };
  const prompt =
    `You are an expert curriculum designer. For the topic "${topic}", generate exactly 5 knowledge dimensions that systematically cover the subject.\n` +
    'The 5 dimensions MUST follow this structure (adapt the specific content to the topic):\n' +
    '0. Basic concepts - foundational definitions, key terms, vocabulary\n' +
    '1. Core principles - underlying mechanisms, derivations, causal logic\n' +
    '2. Practical applications - concrete real-world cases, problem-solving scenarios\n' +
    '3. Common problems and pitfalls - frequent mistakes, edge cases, misconceptions\n' +
    '4. Critical analysis and advanced topics - comparison, synthesis, deeper connections\n' +
    `Write ALL dimension names in ${langName[language] || 'English'}. Each name should be specific to the topic (not generic).\n` +
    'Output ONLY a JSON array of 5 strings, no other text. Do NOT wrap it in code fences.';

  try {
    const response = cleanModelJson(await tutorComplete(
      [{ role: 'system', content: prompt }, { role: 'user', content: `Topic: ${topic}` }],
      context,
      2000,
    ));
    const start = response.indexOf('[');
    const end = response.lastIndexOf(']');
    if (start < 0 || end <= start) throw new Error('No JSON array');
    const parsed = JSON.parse(response.slice(start, end + 1));
    if (!Array.isArray(parsed) || parsed.length < 3) throw new Error('Invalid node list');
    const names = parsed.slice(0, 5).map((value) => String(value || '').trim()).filter(Boolean);
    while (names.length < 5) names.push(`Dimension ${names.length + 1}`);
    return names.map((name) => ({ name, status: 'blank' as const }));
  } catch {
    const zh = language === 'zh';
    const fallback = zh
      ? ['基础概念与术语', '核心原理与机制', '实际应用与问题求解', '常见误区与边界情况', '综合分析与进阶联系']
      : ['Basic concepts and vocabulary', 'Core principles and mechanisms', 'Practical applications', 'Common pitfalls and edge cases', 'Critical analysis and advanced connections'];
    return fallback.map((name) => ({ name, status: 'blank' as const }));
  }
}

function normalizeLevel(value: unknown, fallback: TutorKnowledgeStatus): TutorKnowledgeStatus {
  return value === 'internalized' || value === 'fuzzy' || value === 'blank' ? value : fallback;
}

function parseDiagnosticQuestion(raw: string, index: number): TutorDiagnosticQuestion | null {
  const cleaned = cleanModelJson(raw);
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
      q?: unknown;
      knowledgePoint?: unknown;
      subarea?: unknown;
      opts?: Array<{ text?: unknown; level?: unknown }>;
    };
    const q = String(parsed.q || '').trim();
    const opts = Array.isArray(parsed.opts) ? parsed.opts : [];
    if (!q || opts.length < 3) return null;
    const levels: TutorKnowledgeStatus[] = ['internalized', 'fuzzy', 'blank'];
    const normalized = opts.slice(0, 4).map((option, optionIndex) => ({
      letter: ['A', 'B', 'C', 'D'][optionIndex] || String(optionIndex + 1),
      text: String(option?.text || '').trim() || (
        optionIndex === 0 ? 'I know this well'
          : optionIndex === 1 ? 'I have some familiarity'
            : 'I do not know this yet'
      ),
      level: normalizeLevel(option?.level, levels[Math.min(optionIndex, 2)]),
    }));
    return {
      q,
      knowledgePoint: String(parsed.knowledgePoint || '').trim(),
      subarea: String(parsed.subarea || '').trim() || `Sub-area ${index + 1}`,
      nodeIdx: index % 5,
      opts: normalized,
    };
  } catch {
    return null;
  }
}

export function buildFallbackDiagnosticQuestions(
  topic: string,
  count: number,
): TutorDiagnosticQuestion[] {
  const total = Math.max(1, Math.min(10, Math.trunc(count || 5)));
  const zh = detectLanguage(topic) === 'zh';
  const stems = zh
    ? [
      '下面哪一项最准确地描述了你对「{topic}」基本概念的掌握？',
      '遇到「{topic}」的核心原理时，你目前最接近哪种状态？',
      '如果要把「{topic}」用于一个具体问题，你通常能够做到哪一步？',
      '对于「{topic}」中的常见误区，你目前最接近哪种状态？',
      '当两个与「{topic}」有关的观点冲突时，你通常能做到什么？',
      '看到「{topic}」的专业术语时，你目前的理解程度如何？',
      '如果需要解释「{topic}」为什么成立，你目前能做到哪一步？',
      '面对「{topic}」的陌生例题时，你目前会怎样开始？',
      '当「{topic}」出现边界情况时，你目前能否识别？',
      '如果把「{topic}」与相邻知识联系起来，你目前能做到什么？',
    ]
    : [
      'Which option best describes your grasp of the basic concepts in “{topic}”?',
      'When you meet a core principle in “{topic}”, which state is closest to yours?',
      'If you had to apply “{topic}” to a concrete problem, how far could you get?',
      'Which option best describes your awareness of common misconceptions in “{topic}”?',
      'When two claims about “{topic}” conflict, what can you usually do?',
      'How well do you understand the specialist vocabulary used in “{topic}”?',
      'If asked why a result in “{topic}” is true, how far could you explain?',
      'How would you begin an unfamiliar problem involving “{topic}”?',
      'Can you recognize boundary cases or exceptions in “{topic}”?',
      'How well can you connect “{topic}” to neighbouring ideas?',
    ];
  const options = zh
    ? [
      { letter: 'A', text: '我能准确解释，并能举出自己的例子。', level: 'internalized' as const },
      { letter: 'B', text: '我大致理解，但解释或应用时会卡住。', level: 'fuzzy' as const },
      { letter: 'C', text: '我见过相关内容，但还没有形成清晰理解。', level: 'fuzzy' as const },
      { letter: 'D', text: '这部分对我基本是空白。', level: 'blank' as const },
    ]
    : [
      { letter: 'A', text: 'I can explain it accurately and give my own example.', level: 'internalized' as const },
      { letter: 'B', text: 'I broadly understand it but get stuck when explaining or applying it.', level: 'fuzzy' as const },
      { letter: 'C', text: 'I have seen it before but do not yet have a clear mental model.', level: 'fuzzy' as const },
      { letter: 'D', text: 'This part is essentially new to me.', level: 'blank' as const },
    ];
  return Array.from({ length: total }, (_, index) => ({
    q: stems[index % stems.length].replace('{topic}', topic),
    knowledgePoint: zh ? `知识边界探测 ${index + 1}` : `knowledge boundary probe ${index + 1}`,
    subarea: `Sub-area ${index + 1}`,
    nodeIdx: index % 5,
    opts: options.map((option) => ({ ...option })),
  }));
}

export async function generateDiagnosticQuestions(
  topic: string,
  count: number,
  context: TutorModelContext,
  onProgress?: (current: number, total: number) => void,
): Promise<TutorDiagnosticQuestion[]> {
  const total = Math.max(1, Math.min(10, Math.trunc(count || 5)));
  const language = detectLanguage(topic);
  const languageName: Record<string, string> = {
    zh: 'Chinese', ja: 'Japanese', ko: 'Korean', ru: 'Russian', ar: 'Arabic', en: 'English',
  };
  const result: TutorDiagnosticQuestion[] = [];
  const previous: string[] = [];

  for (let index = 0; index < total; index += 1) {
    onProgress?.(index + 1, total);
    const aspect = ASPECTS[index % ASPECTS.length];
    const previousBlock = previous.length
      ? 'Already asked in this diagnostic. Do NOT repeat the same angle or wording:\n' +
        previous.map((text, i) => `${i + 1}. ${text}`).join('\n')
      : 'This is the first question in the diagnostic.';
    const prompt =
      `You are a thoughtful diagnostic tutor. Generate exactly 1 multiple-choice question (this is question ${index + 1} of ${total}, focused on ${aspect}) to assess a learner's grasp of ${topic}.\n\n` +
      `${previousBlock}\n\n` +
      'Voice and form:\n' +
      `- Write the question and all options in ${languageName[language] || 'English'}. Match the learner's input language exactly.\n` +
      '- Use academic but accessible language. Probe actual understanding, not surface familiarity.\n' +
      '- Avoid em dashes. Use Markdown and LaTeX where appropriate.\n\n' +
      'Structure:\n' +
      `- Probe ${aspect} from a different angle than anything listed above.\n` +
      '- Target one SPECIFIC knowledge point and name it in knowledgePoint.\n' +
      '- Provide 3 to 4 options labeled A, B, C, D.\n' +
      '- Each option includes a level field: internalized, fuzzy, or blank.\n' +
      '- Output ONLY one valid JSON object: {"q":"question text","knowledgePoint":"specific concept","opts":[{"letter":"A","text":"option text","level":"internalized"}]}.\n' +
      '- Do not wrap JSON in code fences.';

    try {
      const raw = await tutorComplete(
        [{ role: 'system', content: prompt }, { role: 'user', content: `Topic: ${topic}` }],
        context,
        8000,
      );
      const parsed = parseDiagnosticQuestion(raw, index);
      if (!parsed) throw new Error('Invalid diagnostic response');
      result.push(parsed);
      previous.push(parsed.q);
    } catch {
      return buildFallbackDiagnosticQuestions(topic, total);
    }
  }
  return result.length === total ? result : buildFallbackDiagnosticQuestions(topic, total);
}

export function applyDiagnosticResults(
  nodes: TutorKnowledgeNode[],
  questions: TutorDiagnosticQuestion[],
  answers: number[],
): TutorKnowledgeNode[] {
  const next = nodes.map((node) => ({
    ...node,
    history: Array.isArray(node.history) ? node.history.slice() : node.history,
  }));
  questions.forEach((question, index) => {
    const answer = answers[index];
    if (answer === undefined || answer < 0) return;
    const option = question.opts[answer];
    if (!option) return;
    const nodeIndex = Math.max(0, Math.min(question.nodeIdx, next.length - 1));
    const node = next[nodeIndex];
    if (!node) return;
    // Same as the SPA: cold-start diagnostics are baseline depth hints,
    // never proof of mastery. Even "internalized" answers become fuzzy.
    const status: TutorKnowledgeStatus = option.level === 'blank' ? 'blank' : 'fuzzy';
    if (node.status !== status) {
      node.history = node.history || [];
      node.history.push({
        date: new Date().toISOString().slice(0, 10),
        from: node.status,
        to: status,
        reason: 'cold-start diagnostic (baseline, not mastery)',
      });
      node.status = status;
    }
    if (question.knowledgePoint) {
      node.system_note =
        `${node.system_note || ''}Tested knowledge point: ${question.knowledgePoint} (baseline: ${status}). `;
    }
  });
  return next;
}

export function buildTeachingPlan(nodes: TutorKnowledgeNode[]): TutorTeachingPlan | null {
  if (!nodes.length) return null;
  const rank: Record<TutorKnowledgeStatus, number> = { blank: 0, fuzzy: 1, internalized: 2 };
  const subtopics = nodes
    .map((node, index) => ({
      index,
      subtopic: {
        name: node.name,
        status: node.status || 'blank',
        objective: `Master ${node.name}`,
        exampleCount: 2,
        practiceCount: 1,
        inspectionType: 'concept' as const,
        prerequisites: [] as string[],
        fromBasics: true as const,
      },
    }))
    .sort((a, b) => rank[a.subtopic.status] - rank[b.subtopic.status] || a.index - b.index)
    .map((entry) => entry.subtopic);
  const currentSubtopicIdx = Math.max(0, subtopics.findIndex((item) => item.status !== 'internalized'));
  return { subtopics, currentSubtopicIdx, createdAt: Date.now() };
}

export function firstTeachingNodeIndex(nodes: TutorKnowledgeNode[], plan: TutorTeachingPlan | null): number {
  if (!nodes.length || !plan?.subtopics.length) return 0;
  const target = plan.subtopics[plan.currentSubtopicIdx]?.name;
  const index = nodes.findIndex((node) => node.name === target);
  return index >= 0 ? index : 0;
}

export function nextTeachingStage(stage: TutorTeachingStage): TutorTeachingStage {
  const order: TutorTeachingStage[] = ['motivate', 'define', 'develop', 'illustrate', 'exercise', 'check'];
  const index = order.indexOf(stage);
  return index >= 0 && index < order.length - 1 ? order[index + 1] : stage;
}

function stageInstruction(stage: TutorTeachingStage): string {
  switch (stage) {
    case 'motivate': return 'Give a short motivation and one concrete intuition. Do not define the concept yet.';
    case 'define': return 'Give the precise definition and only the essential first derivation. Build on the motivation already shown.';
    case 'develop': return 'Add the next layer of the concept and at most one worked example. Do not restart from the definition.';
    case 'illustrate': return 'Give at most two worked examples with clear progression. Do not repeat the preceding exposition.';
    case 'exercise': return "Give exactly one transfer practice problem and wait for the student's attempt.";
    case 'check': return 'Give brief feedback and exactly one short quiz. Do not add another example or practice problem.';
  }
}

function tutorTurnDirective(stage: TutorTeachingStage, first: boolean): string {
  const opening = first
    ? 'This is the opening turn for the current sub-topic.'
    : 'This is a continuation turn. The student has already seen earlier material in the conversation.';
  const scope: Record<TutorTeachingStage, string> = {
    motivate: 'Use 2-4 focused paragraphs, one concrete intuition, and no more than one closing question. Do not emit example, practice, or quiz scaffolds yet.',
    define: 'Use 3-5 focused paragraphs and at most one definition or key-point scaffold. Do not repeat the motivation or previously established foundation.',
    develop: 'Use 3-6 focused paragraphs and at most one example scaffold. Add new reasoning only; do not replay earlier examples or conclusions.',
    illustrate: 'Use at most two example scaffolds in this turn. Keep the surrounding explanation brief and do not restate the whole lesson.',
    exercise: "Use 1-2 short setup paragraphs and exactly one practice scaffold. Stop after presenting it and wait for the student's attempt.",
    check: 'Keep the response concise. Give brief feedback and exactly one quiz scaffold, with no new example or practice scaffold.',
  };
  return `TURN-SCOPE RULES. These rules override generic textbook length defaults above. ${opening} ${scope[stage]} Never pad with synonyms, repeated definitions, repeated derivation steps, or a second conclusion. Every paragraph must add new information.`;
}

function fromBasics(node: TutorKnowledgeNode, continuation: boolean) {
  if (continuation) {
    return 'FOUNDATION ANCHOR FOR THIS FOLLOW-UP:\nThe core definition has already been introduced in the conversation. Refer back to it in at most one sentence when it helps, but do not restate the definition, derivation, examples, or summary. Only revisit the foundation in detail if the student\'s answer shows a specific misconception.\n\n';
  }
  return `CRITICAL — TWO PRINCIPLES YOU MUST FOLLOW FOR THIS SUB-TOPIC:
Principle 1 (DEPTH ONLY): The cold-start diagnostic for this sub-topic is '${node.status || 'unknown'}'. This result tells you ONLY how detailed your explanation should be. A fuzzy/internalized baseline means less scaffolding; blank means more examples and slower pacing. The diagnostic does NOT mean mastery.
Principle 2 (ALWAYS START FROM THE FOUNDATION): Regardless of the diagnostic result, begin this sub-topic from the most essential core definition and build up layer by layer. Never assume the learner already knows the core definition.

`;
}

export function buildTutorApplicationPrompt(
  topic: string,
  node: TutorKnowledgeNode,
  stage: TutorTeachingStage,
  options: { first: boolean; latestAnswer?: string; diagnosticNotes?: string[]; tone?: TonePreset } = { first: false },
): string {
  const stageText = stageInstruction(stage);
  const knowledgeNotes = options.diagnosticNotes?.length
    ? `Diagnostic knowledge points for this sub-topic:\n- ${options.diagnosticNotes.join('\n- ')}\n\n`
    : '';
  let turnContext: string;
  if (options.first) {
    turnContext =
      fromBasics(node, false) +
      knowledgeNotes +
      `You are beginning the '${stage}' stage for sub-topic: ${node.name}. START at this stage — do not run earlier stages. ${stageText}\n` +
      'Follow the textbook principles: start from the foundation, connect the sub-topic to the broader topic, explain only the current stage, and build systematically on prior knowledge.\n\n' +
      tutorTurnDirective(stage, true);
  } else {
    const answer = options.latestAnswer || '';
    turnContext =
      fromBasics(node, true) +
      knowledgeNotes +
      `Current teaching stage: ${stage}. Sub-topic: ${node.name}. The student just said: "${answer}". ` +
      `${stageInstruction(stage)} Connect new material to what was already taught. Do NOT restart from the beginning.\n\n` +
      tutorTurnDirective(stage, false);
  }

  const prompt = SOCRATIC_SYSTEM_PROMPT
    .replace('{topic}', topic)
    .replace('{level}', BASELINE_LEVEL)
    .replace('{context}', turnContext);

  return `[Assistant mode instructions]\n${languageDirectiveFor(options.latestAnswer || topic)}${prompt}${TUTOR_SEARCH_POLICY_PROMPT}${toneVoiceSuffix(options.tone || 'default')}\n\nKeep the user-facing reply focused on the answer. Do not emit <think> blocks or reasoning_content in the user-facing message.`;
}

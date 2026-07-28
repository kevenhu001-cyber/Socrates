const CURRENTNESS_PATTERNS = [
  /\b(today|tonight|yesterday|tomorrow|latest|current|currently|recent|recently|now|this (?:week|month|year)|as of|price|score|schedule|weather|news|election|president|ceo|version|release)\b/i,
  /(今天|今日|昨天|明天|最新|当前|目前|近期|最近|现在|本周|本月|今年|截至|价格|比分|赛程|天气|新闻|选举|总统|首相|CEO|版本|发布)/i,
];

const EXPLICIT_LOOKUP_PATTERNS = [
  /\b(search|browse|look up|google|verify online|check the web|find sources?)\b/i,
  /(搜索|搜一下|查一下|联网|上网查|浏览网页|核实一下|找资料|找来源)/i,
];

export function clampTutorQuestionCount(value) {
  const count = Number.parseInt(String(value), 10);
  if (!Number.isFinite(count)) return 5;
  return Math.max(1, Math.min(10, count));
}

export function shouldAutoSearchTutor(text) {
  const query = String(text || '').trim();
  if (!query) return false;
  return EXPLICIT_LOOKUP_PATTERNS.some((pattern) => pattern.test(query))
    || CURRENTNESS_PATTERNS.some((pattern) => pattern.test(query));
}

export function buildFallbackDiagnosticQuestions(topic, count, isZh) {
  const total = clampTutorQuestionCount(count);
  const zhStems = [
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
  ];
  const enStems = [
    'Which option best describes your grasp of the basic concepts in “{topic}”?',
    'When you meet a core principle in “{topic}”, which state is closest to yours?',
    'If you had to apply “{topic}” to a concrete problem, how far could you get?',
    'Which option best describes your awareness of common misconceptions in “{topic}”?',
    'When two claims about “{topic}” conflict, what can you usually do?',
    'How well do you understand the specialist vocabulary used in “{topic}”?',
    'If asked why a result in “{topic}” is true, how far could you explain it?',
    'How would you begin an unfamiliar problem involving “{topic}”?',
    'Can you recognize boundary cases or exceptions in “{topic}”?',
    'How well can you connect “{topic}” to neighbouring ideas?',
  ];
  const options = isZh
    ? [
        { letter: 'A', text: '我能准确解释，并能举出自己的例子。', level: 'internalized' },
        { letter: 'B', text: '我大致理解，但解释或应用时会卡住。', level: 'fuzzy' },
        { letter: 'C', text: '我见过相关内容，但还没有形成清晰理解。', level: 'fuzzy' },
        { letter: 'D', text: '这部分对我基本是空白。', level: 'blank' },
      ]
    : [
        { letter: 'A', text: 'I can explain it accurately and give my own example.', level: 'internalized' },
        { letter: 'B', text: 'I broadly understand it but get stuck when explaining or applying it.', level: 'fuzzy' },
        { letter: 'C', text: 'I have seen it before but do not yet have a clear mental model.', level: 'fuzzy' },
        { letter: 'D', text: 'This part is essentially new to me.', level: 'blank' },
      ];
  const stems = isZh ? zhStems : enStems;
  return Array.from({ length: total }, (_, index) => ({
    q: stems[index].replace('{topic}', topic),
    knowledgePoint: isZh ? `知识边界探测 ${index + 1}` : `knowledge boundary probe ${index + 1}`,
    opts: options.map((option) => ({ ...option })),
  }));
}

export function requestTutorExploration(options = {}) {
  const isZh = options.isZh === true;
  return new Promise((resolve) => {
    document.getElementById('tutorExplorationDialog')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'tutorExplorationDialog';
    overlay.className = 'tutor-explore-overlay';
    overlay.innerHTML = `
      <section class="tutor-explore-dialog" role="dialog" aria-modal="true" aria-labelledby="tutorExploreTitle">
        <div class="tutor-explore-kicker">${isZh ? '可选的学习起点' : 'Optional starting point'}</div>
        <h2 id="tutorExploreTitle">${isZh ? '先厘清你的知识边界吗？' : 'Explore your knowledge boundary first?'}</h2>
        <p>${isZh ? '回答几道选择题可以帮助导师调整起点。你也可以跳过，直接开始学习。' : 'A short multiple-choice exploration helps the tutor choose a starting point. You can also skip it and begin learning.'}</p>
        <label class="tutor-explore-count">
          <span>${isZh ? '问题数量' : 'Number of questions'}</span>
          <input id="tutorExploreCount" type="number" inputmode="numeric" min="1" max="10" value="5" aria-describedby="tutorExploreCountHint">
          <small id="tutorExploreCountHint">${isZh ? '1 至 10 道，全部为选择题' : '1 to 10, all multiple choice'}</small>
        </label>
        <div class="tutor-explore-actions">
          <button type="button" class="tutor-explore-skip">${isZh ? '直接开始' : 'Start without questions'}</button>
          <button type="button" class="tutor-explore-start">${isZh ? '开始探索' : 'Start exploration'}</button>
        </div>
      </section>`;
    const onKeyDown = (event) => { if (event.key === 'Escape') finish(null); };
    const finish = (result) => {
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      resolve(result);
    };
    overlay.querySelector('.tutor-explore-skip').addEventListener('click', () => finish({ enabled: false, count: 0 }));
    overlay.querySelector('.tutor-explore-start').addEventListener('click', () => {
      finish({ enabled: true, count: clampTutorQuestionCount(overlay.querySelector('#tutorExploreCount').value) });
    });
    overlay.addEventListener('click', (event) => { if (event.target === overlay) finish(null); });
    document.addEventListener('keydown', onKeyDown);
    document.body.appendChild(overlay);
    overlay.querySelector('#tutorExploreCount').focus();
  });
}

export const TUTOR_SEARCH_POLICY_PROMPT = `

## Tutor web-search policy

Do not search the web for stable foundational or textbook knowledge that you already know, such as definitions in calculus, complex analysis, algebra, physics, or programming fundamentals. Use web_search only when the learner explicitly asks you to search, the answer depends on current or time-sensitive information, or the topic is genuinely unfamiliar to you and you cannot teach it reliably from your existing knowledge. Never search merely because tutor mode is active, and never repeat a search whose useful result is already present in the conversation.`;

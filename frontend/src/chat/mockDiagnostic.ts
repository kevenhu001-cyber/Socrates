export interface MockKbNode {
  name: string;
  status: string;
  questions: number;
  system_note: string;
  user_note: string;
  confidence_score: number;
  history: Array<unknown>;
}

export interface MockDiagOpt {
  letter: string;
  text: string;
  level: string;
}

export interface MockDiagQuestion {
  q: string;
  knowledgePoint: string;
  subarea: string;
  nodeIdx: number;
  opts: MockDiagOpt[];
}

export interface MockResult {
  domain: string;
  nodes: MockKbNode[];
  diagQuestions: MockDiagQuestion[];
}

export function aiGenerate(topic: string): MockResult {
  const clean = topic.replace(/^(i want to |i'd like to |i would like to |learn about |learn |understand |study |explore )/i, '').replace(/[.!?]+$/, '').trim();
  let domain = clean.length > 30 ? clean.substring(0, 27) + '...' : clean;
  domain = domain.charAt(0).toUpperCase() + domain.slice(1);

  const nodes: MockKbNode[] = [
    { name: 'Basic concepts of ' + domain, status: 'blank', questions: 0, system_note: '', user_note: '', confidence_score: 0, history: [] },
    { name: 'Core principles of ' + domain, status: 'blank', questions: 0, system_note: '', user_note: '', confidence_score: 0, history: [] },
    { name: 'Practical applications of ' + domain, status: 'blank', questions: 0, system_note: '', user_note: '', confidence_score: 0, history: [] },
    { name: 'Common problems and pitfalls in ' + domain, status: 'blank', questions: 0, system_note: '', user_note: '', confidence_score: 0, history: [] },
    { name: 'Critical analysis and advanced ' + domain, status: 'blank', questions: 0, system_note: '', user_note: '', confidence_score: 0, history: [] },
  ];

  const diagQs = generateMockDiagQs(domain);
  return { domain, nodes, diagQuestions: diagQs };
}

interface MockTemplate {
  knowledgePoint: string;
  subarea: string;
  nodeIdx: number;
  q: string[];
  opts: MockDiagOpt[][];
}

export function generateMockDiagQs(domain: string): MockDiagQuestion[] {
  const subareaNames = [
    'Basic concepts of ' + domain,
    'Core principles of ' + domain,
    'Practical applications of ' + domain,
    'Common problems and pitfalls in ' + domain,
    'Critical analysis and advanced ' + domain,
  ];
  const templates: MockTemplate[] = [
    {
      knowledgePoint: 'core definitions and key vocabulary',
      subarea: subareaNames[0],
      nodeIdx: 0,
      q: ['How familiar are you with the core concepts of ' + domain + '?', 'What is your current level of understanding of ' + domain + "'s core ideas?"],
      opts: [
        [
          { letter: 'A', text: 'I have a clear mental model of the core concepts and can apply them independently', level: 'internalized' },
          { letter: 'B', text: 'I have heard of them but could not explain them precisely', level: 'fuzzy' },
          { letter: 'C', text: 'I do not know what the core concepts are', level: 'blank' },
        ],
        [
          { letter: 'A', text: 'I can articulate the core concepts and how they connect', level: 'internalized' },
          { letter: 'B', text: 'I recognize the names but cannot define them', level: 'fuzzy' },
          { letter: 'C', text: 'I have not encountered the core concepts', level: 'blank' },
        ],
      ],
    },
    {
      knowledgePoint: 'underlying mechanisms and derivations',
      subarea: subareaNames[1],
      nodeIdx: 1,
      q: ['How well can you explain the key principles that govern ' + domain + '?'],
      opts: [
        [
          { letter: 'A', text: 'I can state the principles and reason from them', level: 'internalized' },
          { letter: 'B', text: 'I know some principles exist but cannot articulate them', level: 'fuzzy' },
          { letter: 'C', text: 'I do not know which principles are central to ' + domain, level: 'blank' },
        ],
      ],
    },
    {
      knowledgePoint: 'real-world application cases',
      subarea: subareaNames[2],
      nodeIdx: 2,
      q: ['Can you give a concrete real-world example where ' + domain + ' is applied?'],
      opts: [
        [
          { letter: 'A', text: 'Yes, and I can describe how it works in detail', level: 'internalized' },
          { letter: 'B', text: 'I have heard of applications but cannot describe one fully', level: 'fuzzy' },
          { letter: 'C', text: 'I do not know any real applications of ' + domain, level: 'blank' },
        ],
      ],
    },
    {
      knowledgePoint: 'common mistakes and edge cases',
      subarea: subareaNames[3],
      nodeIdx: 3,
      q: ['Are you aware of common misconceptions or pitfalls in ' + domain + '?'],
      opts: [
        [
          { letter: 'A', text: 'I can name several misconceptions and explain why they are wrong', level: 'internalized' },
          { letter: 'B', text: 'I have a vague sense of what goes wrong but cannot name specifics', level: 'fuzzy' },
          { letter: 'C', text: 'I have not thought about misconceptions in ' + domain, level: 'blank' },
        ],
      ],
    },
    {
      knowledgePoint: 'critical comparison and synthesis',
      subarea: subareaNames[4],
      nodeIdx: 4,
      q: ['How comfortable are you with the more advanced aspects of ' + domain + '?'],
      opts: [
        [
          { letter: 'A', text: 'I have explored advanced material and feel comfortable', level: 'internalized' },
          { letter: 'B', text: 'I know it exists but have not engaged with it', level: 'fuzzy' },
          { letter: 'C', text: 'I do not know what the advanced parts of ' + domain + ' are', level: 'blank' },
        ],
      ],
    },
  ];
  const pool = templates.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  return pool.map(function (t: MockTemplate) {
    const qi = Math.floor(Math.random() * t.q.length);
    const oi = Math.floor(Math.random() * t.opts.length);
    return { q: t.q[qi], knowledgePoint: t.knowledgePoint, subarea: t.subarea, nodeIdx: t.nodeIdx, opts: t.opts[oi] };
  });
}

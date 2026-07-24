interface TPSubTopic {
  name: string;
  status: string;
  objective: string;
  exampleCount: number;
  practiceCount: number;
  inspectionType: string;
  prerequisites: string[];
  fromBasics: boolean;
}

interface TPNode {
  name: string;
  status?: string;
  [key: string]: unknown;
}

interface TeachingPlan {
  subtopics: TPSubTopic[];
  currentSubtopicIdx: number;
  createdAt: number;
}

interface TPState {
  kbNodes: TPNode[];
  teachingPlan?: TeachingPlan;
  currentNode?: number;
}

export function buildTeachingPlanFromKB(state: TPState): TeachingPlan | null {
  const nodes = state.kbNodes || [];
  if (!nodes.length) return null;
  let subtopics: TPSubTopic[] = nodes.map(function (n: TPNode) {
    return {
      name: n.name,
      status: n.status || 'blank',
      objective: 'Master ' + n.name,
      exampleCount: 2,
      practiceCount: 1,
      inspectionType: 'concept',
      prerequisites: [],
      fromBasics: true,
    };
  });
  const rank: Record<string, number> = { blank: 0, fuzzy: 1, internalized: 2 };
  subtopics = subtopics
    .map(function (s: TPSubTopic, i: number) { return { s, i }; })
    .sort(function (a, b) {
      const ra = rank[a.s.status] != null ? rank[a.s.status] : 0;
      const rb = rank[b.s.status] != null ? rank[b.s.status] : 0;
      if (ra !== rb) return ra - rb;
      return a.i - b.i;
    })
    .map(function (x) { return x.s; });
  let currentSubtopicIdx = 0;
  for (let i = 0; i < subtopics.length; i++) {
    if (subtopics[i].status !== 'internalized') {
      currentSubtopicIdx = i;
      break;
    }
    if (i === subtopics.length - 1) currentSubtopicIdx = 0;
  }
  return {
    subtopics,
    currentSubtopicIdx,
    createdAt: Date.now(),
  };
}

export function syncCurrentNodeFromTeachingPlan(state: TPState): void {
  if (!state.teachingPlan || !state.teachingPlan.subtopics.length) return;
  let firstActive = -1;
  for (let pi = 0; pi < state.teachingPlan.subtopics.length; pi++) {
    if (state.teachingPlan.subtopics[pi].status !== 'internalized') {
      firstActive = pi;
      break;
    }
  }
  if (firstActive < 0) return;
  state.teachingPlan.currentSubtopicIdx = firstActive;
  const targetName = state.teachingPlan.subtopics[firstActive].name;
  let matchedIdx = -1;
  for (let kni = 0; kni < state.kbNodes.length; kni++) {
    if (state.kbNodes[kni].name === targetName) {
      matchedIdx = kni;
      break;
    }
  }
  state.currentNode = matchedIdx >= 0 ? matchedIdx : Math.min(firstActive, state.kbNodes.length - 1);
}

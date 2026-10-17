export interface KbNode {
  name: string;
  status?: string;
  [key: string]: unknown;
}

export interface TeachingSubtopic {
  name: string;
  status: string;
  objective: string;
  exampleCount: number;
  practiceCount: number;
  inspectionType: string;
  prerequisites: string[];
  fromBasics: boolean;
}

export interface TeachingPlan {
  subtopics: TeachingSubtopic[];
  currentSubtopicIdx: number;
  createdAt: number;
}

/** The slice of the tutor store both helpers read. */
export interface TeachingPlanState {
  kbNodes?: KbNode[] | null;
  teachingPlan?: TeachingPlan | null;
}

export interface SyncedTeachingPlan {
  teachingPlan: TeachingPlan;
  currentNode: number;
}

const STATUS_RANK: Record<string, number> = { blank: 0, fuzzy: 1, internalized: 2 };

export function buildTeachingPlanFromKB(state: TeachingPlanState): TeachingPlan | null {
  const nodes = state.kbNodes || [];
  if (!nodes.length) return null;
  const subtopics: TeachingSubtopic[] = nodes.map((node) => ({
    name: node.name,
    status: node.status || 'blank',
    objective: 'Master ' + node.name,
    exampleCount: 2,
    practiceCount: 1,
    inspectionType: 'concept',
    prerequisites: [],
    fromBasics: true,
  }));
  const ordered = subtopics
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      const ra = STATUS_RANK[a.s.status] != null ? STATUS_RANK[a.s.status] : 0;
      const rb = STATUS_RANK[b.s.status] != null ? STATUS_RANK[b.s.status] : 0;
      if (ra !== rb) return ra - rb;
      return a.i - b.i;
    })
    .map((entry) => entry.s);
  let currentSubtopicIdx = 0;
  for (let i = 0; i < ordered.length; i++) {
    if (ordered[i].status !== 'internalized') {
      currentSubtopicIdx = i;
      break;
    }
    if (i === ordered.length - 1) currentSubtopicIdx = 0;
  }
  return {
    subtopics: ordered,
    currentSubtopicIdx,
    createdAt: Date.now(),
  };
}

export function syncCurrentNodeFromTeachingPlan(state: TeachingPlanState): SyncedTeachingPlan | null {
  const plan = state.teachingPlan;
  if (!plan || !plan.subtopics.length) return null;
  let firstActive = -1;
  for (let pi = 0; pi < plan.subtopics.length; pi++) {
    if (plan.subtopics[pi].status !== 'internalized') {
      firstActive = pi;
      break;
    }
  }
  if (firstActive < 0) return null;
  const teachingPlan: TeachingPlan = Object.assign({}, plan, { currentSubtopicIdx: firstActive });
  const targetName = plan.subtopics[firstActive].name;
  const kbNodes = state.kbNodes || [];
  let matchedIdx = -1;
  for (let kni = 0; kni < kbNodes.length; kni++) {
    if (kbNodes[kni].name === targetName) {
      matchedIdx = kni;
      break;
    }
  }
  return {
    teachingPlan,
    currentNode: matchedIdx >= 0 ? matchedIdx : Math.min(firstActive, kbNodes.length - 1),
  };
}

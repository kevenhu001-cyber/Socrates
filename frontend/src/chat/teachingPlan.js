export function buildTeachingPlanFromKB(state) {
  var nodes = state.kbNodes || [];
  if (!nodes.length) return null;
  var subtopics = nodes.map(function (n) {
    return {
      name: n.name,
      status: n.status || 'blank',
      objective: 'Master ' + n.name,
      exampleCount: 2,
      practiceCount: 1,
      inspectionType: 'concept',
      prerequisites: [],
      fromBasics: true
    };
  });
  var rank = { blank: 0, fuzzy: 1, internalized: 2 };
  subtopics = subtopics.map(function (s, i) { return { s: s, i: i }; })
    .sort(function (a, b) {
      var ra = rank[a.s.status] != null ? rank[a.s.status] : 0;
      var rb = rank[b.s.status] != null ? rank[b.s.status] : 0;
      if (ra !== rb) return ra - rb;
      return a.i - b.i;
    })
    .map(function (x) { return x.s; });
  var currentSubtopicIdx = 0;
  for (var i = 0; i < subtopics.length; i++) {
    if (subtopics[i].status !== 'internalized') {
      currentSubtopicIdx = i;
      break;
    }
    if (i === subtopics.length - 1) currentSubtopicIdx = 0;
  }
  return {
    subtopics: subtopics,
    currentSubtopicIdx: currentSubtopicIdx,
    createdAt: Date.now()
  };
}

export function syncCurrentNodeFromTeachingPlan(state) {
  if (!state.teachingPlan || !state.teachingPlan.subtopics.length) return;
  var firstActive = -1;
  for (var pi = 0; pi < state.teachingPlan.subtopics.length; pi++) {
    if (state.teachingPlan.subtopics[pi].status !== 'internalized') {
      firstActive = pi;
      break;
    }
  }
  if (firstActive < 0) return;
  state.teachingPlan.currentSubtopicIdx = firstActive;
  var targetName = state.teachingPlan.subtopics[firstActive].name;
  var matchedIdx = -1;
  for (var kni = 0; kni < state.kbNodes.length; kni++) {
    if (state.kbNodes[kni].name === targetName) {
      matchedIdx = kni;
      break;
    }
  }
  state.currentNode = matchedIdx >= 0 ? matchedIdx : Math.min(firstActive, state.kbNodes.length - 1);
}

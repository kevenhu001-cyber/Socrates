export function renderKnowledgeView() {
  var cont = document.getElementById('teachingPlanContent');
  if (!cont) return;
  if (typeof tutorSocratic === 'object' && tutorSocratic && typeof tutorSocratic.renderTeachingPlan === 'function') {
    try { tutorSocratic.renderTeachingPlan(); } catch (_) {}
  }
}

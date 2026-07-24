export function renderKnowledgeView(): void {
  const cont = document.getElementById('teachingPlanContent');
  if (!cont) return;
  const ts = (window as any).tutorSocratic;
  if (ts && typeof ts.renderTeachingPlan === 'function') {
    try { ts.renderTeachingPlan(); } catch (_) { /* noop */ }
  }
}

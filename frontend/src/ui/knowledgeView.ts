
import { reportSwallow } from '../util/reportSwallow.ts';

export function renderKnowledgeView() {
  const cont = document.getElementById('teachingPlanContent');
  if (!cont) return;
  const tutorSocratic = (window as Window & { tutorSocratic?: { renderTeachingPlan?: () => void } }).tutorSocratic;
  if (typeof tutorSocratic === 'object' && tutorSocratic && typeof tutorSocratic.renderTeachingPlan === 'function') {
    try { tutorSocratic.renderTeachingPlan(); } catch (error) { reportSwallow(error, 'ui/knowledgeView.ts:5'); }
  }
}

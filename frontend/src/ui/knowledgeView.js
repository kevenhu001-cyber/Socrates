
import { reportSwallow } from '../util/reportSwallow.ts';

export function renderKnowledgeView() {
  var cont = document.getElementById('teachingPlanContent');
  if (!cont) return;
  if (typeof tutorSocratic === 'object' && tutorSocratic && typeof tutorSocratic.renderTeachingPlan === 'function') {
    try { tutorSocratic.renderTeachingPlan(); } catch (error) { reportSwallow(error, 'ui/knowledgeView.js:5'); }
  }
}

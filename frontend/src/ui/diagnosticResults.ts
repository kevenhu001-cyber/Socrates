import { esc } from '../render/helpers.js';
import { scrollContainer } from './scroll.js';

export interface DiagResultsState {
  diagQuestions: Array<{ opts: Array<{ letter: string; text: string; level: string }> }>;
  diagAnswers: (number | undefined)[];
  kbNodes: Array<{ name: string; status?: string }>;
}

export function renderDiagResultsScreen(state: DiagResultsState, isZh: boolean): void {
  const view = document.getElementById('diagnosticView') as HTMLElement | null;
  if (!view) return;
  const summary: Record<string, number> = { internalized: 0, fuzzy: 0, blank: 0 };
  state.diagQuestions.forEach(function (q, i) {
    const ans = state.diagAnswers[i];
    if (ans === undefined || ans === -1) return;
    const level = q.opts[ans].level;
    const status = level === 'blank' ? 'blank' : 'fuzzy';
    summary[status] = (summary[status] || 0) + 1;
  });

  let html = '<div class="diag-results">';
  html += '<div class="diag-results-title">' + (isZh ? '测试结果解读' : 'Diagnostic Results Interpretation') + '</div>';
  html += '<div class="diag-results-notice">';
  html += '<div class="diag-results-notice-icon">i</div>';
  html += '<div class="diag-results-notice-text">';
  html += isZh
    ? '<strong>重要提示：</strong>冷启动测试仅用于探测您的知识边界基线——<strong>无论答题结果如何</strong>（"有一定基础"或"待探索"），系统都会<strong>从最本质、最基础的核心定义开始</strong>讲解。诊断结果只用来决定讲解的<strong>详细程度</strong>：掌握较好的维度讲得更简略、例子更少；尚未接触的维度讲得更详细、例子更多、铺垫更充分。'
    : '<strong>Important:</strong> The cold-start test only establishes a baseline of your knowledge boundary. <strong>Regardless of how you answered</strong> ("some familiarity" or "to explore"), the system will always begin each topic <strong>from the most essential, foundational core definition</strong>. The diagnostic result is used <strong>only</strong> to modulate the depth of the explanation: topics you know better are taught more concisely with fewer examples; topics you have not seen are taught in greater detail with more examples and scaffolding.';
  html += '</div></div>';

  html += '<div class="diag-results-grid">';
  state.kbNodes.forEach(function (node, i) {
    const status = node.status || 'blank';
    const statusLabel = isZh
      ? (status === 'fuzzy' ? '有一定基础' : '未知/空白')
      : (status === 'fuzzy' ? 'Some familiarity' : 'Unknown/Blank');
    const statusClass = status === 'fuzzy' ? 'fuzzy' : 'blank';
    html += '<div class="diag-result-card ' + statusClass + '">';
    html += '<div class="diag-result-card-num">' + (i + 1) + '</div>';
    html += '<div class="diag-result-card-name">' + esc(node.name) + '</div>';
    html += '<div class="diag-result-card-status">' + statusLabel + '</div>';
    html += '</div>';
  });
  html += '</div>';

  html += '<div class="diag-results-summary">';
  html += isZh
    ? '基线评估：' + summary.fuzzy + ' 个维度有一定基础，' + summary.blank + ' 个维度待探索'
    : 'Baseline: ' + summary.fuzzy + ' dimension(s) with some familiarity, ' + summary.blank + ' dimension(s) to explore';
  html += '</div>';

  html += '<div class="diag-results-actions">';
  html += '<button class="diag-results-continue" onclick="proceedToTeaching()">' + (isZh ? '开始系统学习' : 'Start Systematic Learning') + '</button>';
  html += '</div>';
  html += '</div>';

  view.innerHTML = html;
  const sc = scrollContainer();
  if (sc) sc.scrollTop = 0;
}

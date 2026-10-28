import { scrollContainer } from './scroll.js';
import { renderDiagnostic } from '../react/tutor/diagnosticHost.tsx';

function resultsNotice(isZh) {
  return isZh
    ? "<strong>重要提示：</strong>冷启动测试仅用于探测您的知识边界基线——<strong>无论答题结果如何</strong>（\"有一定基础\"或\"待探索\"），系统都会<strong>从最本质、最基础的核心定义开始</strong>讲解。诊断结果只用来决定讲解的<strong>详细程度</strong>：掌握较好的维度讲得更简略、例子更少；尚未接触的维度讲得更详细、例子更多、铺垫更充分。"
    : "<strong>Important:</strong> The cold-start test only establishes a baseline of your knowledge boundary. <strong>Regardless of how you answered</strong> (\"some familiarity\" or \"to explore\"), the system will always begin each topic <strong>from the most essential, foundational core definition</strong>. The diagnostic result is used <strong>only</strong> to modulate the depth of the explanation: topics you know better are taught more concisely with fewer examples; topics you have not seen are taught in greater detail with more examples and scaffolding.";
}

/* The results screen is a React view; `data-diag-command="proceed"` keeps the
   delegated handler in `tutor/diagnosticFlow.js` working unchanged. */
export function renderDiagResultsScreen(state, isZh) {
  var summary = { internalized: 0, fuzzy: 0, blank: 0 };
  state.diagQuestions.forEach(function (q, i) {
    var ans = state.diagAnswers[i];
    if (ans === undefined || ans === -1) return;
    var level = q.opts[ans].level;
    /* Use the downscaled status for display consistency */
    var status = level === "blank" ? "blank" : "fuzzy";
    summary[status] = (summary[status] || 0) + 1;
  });

  renderDiagnostic({
    kind: 'results',
    title: isZh ? "测试结果解读" : "Diagnostic Results Interpretation",
    noticeHtml: resultsNotice(isZh),
    nodes: state.kbNodes.map(function (node) {
      return { name: node.name, status: node.status === "fuzzy" ? "fuzzy" : "blank" };
    }),
    summary: isZh
      ? "基线评估：" + summary.fuzzy + " 个维度有一定基础，" + summary.blank + " 个维度待探索"
      : "Baseline: " + summary.fuzzy + " dimension(s) with some familiarity, " + summary.blank + " dimension(s) to explore",
    continueLabel: isZh ? "开始系统学习" : "Start Systematic Learning",
    statusLabels: {
      fuzzy: isZh ? "有一定基础" : "Some familiarity",
      blank: isZh ? "未知/空白" : "Unknown/Blank",
    },
  });

  scrollContainer().scrollTop = 0;
}

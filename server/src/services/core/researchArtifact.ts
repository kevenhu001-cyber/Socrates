import type { ResearchSource } from '../../db/schema/research.js';

const LATEX_ESCAPES: Record<string, string> = {
  '\\': '\\textbackslash{}', '#': '\\#', '$': '\\$', '%': '\\%', '&': '\\&',
  '_': '\\_', '{': '\\{', '}': '\\}', '^': '\\textasciicircum{}', '~': '\\textasciitilde{}',
};
const escape = (value: string) => value.replace(/[\\#$%&_{}^~]/g, (character) => LATEX_ESCAPES[character]);

/** Preserve the existing downloadable .tex companion when moving artifact
 * creation out of the browser. Treat all report text as literal content. */
export function researchReportToLatex(title: string, report: string, sources: ResearchSource[]) {
  const cjk = /[\u3400-\u9fff]/.test(title + report);
  const references = sources.map((source, index) => `\\item [${index + 1}] ${escape(source.title)} — \\url{${source.url.replace(/[{}\\]/g, '')}}`).join('\n');
  return `\\documentclass[11pt]{${cjk ? 'ctexart' : 'article'}}
\\usepackage[margin=1in]{geometry}
\\usepackage{hyperref}
\\usepackage{parskip}
\\title{${escape(title)}}
\\date{\\today}
\\begin{document}
\\maketitle
${escape(report)}
\\section*{Evidence sources}
\\begin{enumerate}
${references}
\\end{enumerate}
\\end{document}
`;
}

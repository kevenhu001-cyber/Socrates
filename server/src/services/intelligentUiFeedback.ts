/**
 * Correction package for a rejected render_intelligent_ui call.
 *
 * The old correction was one line ("Fix the UI and call render_intelligent_ui
 * again: <error>"), so the model rewrote the whole program blind and often
 * repeated the same mistake until the per-tool retry budget ran out and the
 * card vanished. This module turns the structured validation result into:
 *   - a model-facing correction naming the failing template, its exact
 *     payload contract and a complete working OpenUI line;
 *   - a specific instruction when the program was cut off mid-stream
 *     (send fewer points) instead of "fix the syntax";
 *   - a short user-facing reason and a machine-readable `detail` the client
 *     failure card reads (stage, template, title, issue paths).
 */
import { MAX_VISUALIZATION_POINTS } from '@socrates/core/visualizationNormalize';
import type { OpenUiVisualizationFailure } from './openUiProgram.js';
import { VISUALIZATION_TEMPLATE_CONTRACTS } from './visualization.js';

export type IntelligentUiFailureStage =
  | 'envelope'
  | 'action'
  | 'openui_syntax'
  | 'openui_truncated'
  | 'openui_program'
  | 'demonstration'
  | 'physics'
  | 'visualization';

export interface IntelligentUiFailure {
  stage: IntelligentUiFailureStage;
  nodeId: string | null;
  failures: OpenUiVisualizationFailure[];
  sourceChars: number;
}

export interface IntelligentUiFeedback {
  correction: string;
  userMessage: string;
  detail: {
    stage: IntelligentUiFailureStage;
    nodeId: string | null;
    visualizations: Array<{ template: string | null; title: string | null; stage: string; paths: string[]; issues: string[] }>;
    truncated: boolean;
  };
}

function exampleLine(template: string): string | null {
  const contract = VISUALIZATION_TEMPLATE_CONTRACTS[template as keyof typeof VISUALIZATION_TEMPLATE_CONTRACTS];
  if (!contract) return null;
  return `v = Visualization(${JSON.stringify(template)}, "Short title", ${JSON.stringify(contract.payload)}, "One sentence describing the visual.")`;
}

const NUMBER_HINT = 'Write chart values as JSON numbers (12.5, not "12.5" or "12.5%"), use null for a missing value, and keep series as an array of {name,data} objects.';

function userMessageFor(failure: IntelligentUiFailure): string {
  switch (failure.stage) {
    case 'openui_truncated':
      return '可视化内容在生成时被截断（数据量过大），已请模型减少数据点后重新生成。';
    case 'openui_syntax':
    case 'openui_program':
      return '可视化程序有语法问题，已附上正确写法请模型重新生成。';
    case 'visualization': {
      const first = failure.failures[0];
      const what = first?.template ? `「${first.template}」图表` : '图表';
      if (first?.stage === 'payload_shape') return `${what}的数据格式不符合要求，已附上正确示例请模型修正。`;
      if (first?.stage === 'semantic') return `${what}的数据前后不一致（数量或取值不匹配），已请模型修正。`;
      if (first?.stage === 'envelope') return `${what}缺少标题或模板名，已请模型补全。`;
      if (first?.stage === 'envelope_misuse') return '图表参数顺序写错了，已附上正确写法请模型修正。';
      if (first?.stage === 'extension_safety') return '插图包含沙箱不允许的内容，已请模型修正。';
      return `${what}没有通过校验，已请模型修正。`;
    }
    case 'action':
      return '交互按钮缺少动作，已请模型修正。';
    case 'demonstration':
      return '演示程序的结构不符合要求，已请模型修正。';
    case 'physics':
      return '物理演示的参数不符合要求，已请模型修正。';
    default:
      return '可视化结构不符合要求，已请模型修正。';
  }
}

export function intelligentUiFeedback(error: string, failure: IntelligentUiFailure): IntelligentUiFeedback {
  const lines = [`Fix the UI and call render_intelligent_ui again: ${error}`];
  if (failure.stage === 'openui_truncated') {
    lines.push(`The OpenUI source (${failure.sourceChars} characters) ends mid-string or mid-statement: it was cut off while being written, most likely by the output limit. Do not resend the same program. Send fewer data points (about 200 per series is plenty for reading; never more than ${MAX_VISUALIZATION_POINTS}), shorter labels, or split it into several smaller visuals.`);
  }
  const templates = [...new Set(failure.failures.map((item) => item.template).filter((item): item is string => !!item))].slice(0, 3);
  for (const template of templates) {
    const contract = VISUALIZATION_TEMPLATE_CONTRACTS[template as keyof typeof VISUALIZATION_TEMPLATE_CONTRACTS];
    if (!contract) {
      lines.push(`"${template}" is not a Visualization template. Use one of: ${Object.keys(VISUALIZATION_TEMPLATE_CONTRACTS).join(', ')}. For rows and columns of data use the Table component instead.`);
      continue;
    }
    lines.push(`Visualization "${template}" contract: ${contract.guidance}`);
    const line = exampleLine(template);
    if (line) lines.push(`A valid call: ${line}`);
  }
  if (failure.failures.some((item) => item.stage === 'payload_shape' || item.stage === 'semantic')) lines.push(NUMBER_HINT);
  if (failure.stage === 'demonstration') {
    lines.push('A demonstration node is {id, type:"demonstration", title, program:{version:1, parameters:[], definitions:{}, views:[...]}}. Put version inside program and write it as the number 1. Write arrays as JSON arrays (never {"item": ...}), numbers as JSON numbers (1, not "1"), give every parameter finite min < max with value inside that range, and use 1–8 views with increasing x/y ranges.');
    lines.push('A minimal valid node: {"id":"demo","type":"demonstration","title":"Demo","program":{"version":1,"parameters":[{"id":"a","label":"A","value":1,"min":0,"max":2,"step":0.1}],"definitions":{"f":"a*x"},"views":[{"kind":"controls"},{"kind":"plot","x":[0,1],"y":[0,2],"curves":[{"expression":"f","label":"a·x"}]}]}}');
  }
  if (failure.stage === 'physics') {
    lines.push('A physics node is {id, type:"physics", scene:"<reviewed model>", title, parameters:{...}}. Use one of the documented scenes, pass numeric parameter values inside their documented bounds, and omit fields to take the defaults.');
  }
  if (failure.stage === 'envelope') {
    lines.push('The call envelope is {version:1, nodes:[...]}. Node ids must match ^[A-Za-z0-9._:-]+$ and be unique, every parent must name a node in the same call, and only the documented node types are accepted. Keep the whole document under 60000 characters.');
  }
  if (failure.stage === 'openui_syntax' || failure.stage === 'openui_program') {
    lines.push('Write one statement per line as name = Component(...), define root = Col([...]) first, close every string, bracket and parenthesis, and pass Visualization arguments in order: template, title, payload, accessibilitySummary.');
  }
  return {
    correction: lines.join('\n'),
    userMessage: userMessageFor(failure),
    detail: {
      stage: failure.stage,
      nodeId: failure.nodeId,
      visualizations: failure.failures.slice(0, 4).map((item) => ({
        template: item.template,
        title: item.title,
        stage: item.stage,
        paths: item.issues.map((issue) => issue.path).slice(0, 6),
        issues: item.issues.map((issue) => `${issue.path}: ${issue.message}`).slice(0, 6),
      })),
      truncated: failure.stage === 'openui_truncated',
    },
  };
}

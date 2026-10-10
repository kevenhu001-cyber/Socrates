/**
 * chat/thinkExtract.ts — inline thinking text helpers for streaming turns.
 *
 * Extracted from the addStreamingMessage closure in main.js. These pure
 * helpers parse provider reasoning and inline <think> blocks; the visible
 * summary surface deliberately does not render their raw text.
 */

/** Default divider between reasoning_content and inline <think> text. */
export const INLINE_THINK_DIVIDER = '—— inline thinking ——';

/**
 * Extract the text inside <think>...</think> blocks, including an
 * unclosed trailing <think> tail that is still streaming in.
 */
export function extractThinkText(raw: unknown): string {
  if (typeof raw !== 'string' || raw.indexOf('<think>') === -1) return '';
  const out: string[] = [];
  const re = /<think>([\s\S]*?)<\/think>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    if (m[1]) out.push(m[1]);
  }
  const lastOpen = raw.lastIndexOf('<think>');
  const lastClose = raw.lastIndexOf('</think>');
  if (lastOpen !== -1 && lastClose < lastOpen) {
    const tail = raw.slice(lastOpen + '<think>'.length);
    if (tail) out.push(tail);
  }
  return out.join('\n\n');
}

export interface CombineThinkingTextOptions {
  /** Explicit divider; when omitted the i18n key is resolved like before. */
  divider?: string;
}

/**
 * Combine reasoning_content deltas with inline <think> text for the
 * thinking panel snapshot. Returns whichever part exists, or both joined
 * by the divider when both exist.
 */
export function combineThinkingText(
  reasoning: unknown,
  full: unknown,
  options?: CombineThinkingTextOptions,
): string {
  const parts: string[] = [];
  if (reasoning) parts.push(String(reasoning));
  const thinkText = extractThinkText(full);
  if (thinkText) parts.push(thinkText);
  if (parts.length < 2) return parts.join('\n\n');
  let divider = options?.divider ?? INLINE_THINK_DIVIDER;
  if (options?.divider === undefined) {
    try {
      const w = (globalThis as { window?: { t?: unknown } }).window;
      if (typeof w !== 'undefined' && typeof w.t === 'function') {
        const d = (w.t as (key: string) => unknown)('think.inlineThinkDivider');
        if (d && d !== 'think.inlineThinkDivider') divider = String(d);
      }
    } catch {
      /* i18n lookup is best effort; keep the default divider. */
    }
  }
  return parts[0] + '\n\n' + divider + '\n\n' + parts[1];
}

function sanitizeSummaryStep(text: string): string {
  return text
    .replace(/^[#*`>~_-\s]+/, '')
    .replace(/[#*`>~_-\s]+$/, '')
    .replace(/[:：]$/, '')
    .trim();
}

/**
 * Extract an active step / intent summary from streaming or settled reasoning text.
 * Prioritizes explicit step headers (e.g. "第一步：拆解运动条件和数据分析"), then
 * goal/action phrases, then the latest active sentence or thought premise.
 */
export function extractStepSummary(rawReasoning: unknown): string {
  if (typeof rawReasoning !== 'string') return '';
  const clean = rawReasoning
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#+\s+/gm, '')
    .trim();
  if (!clean) return '';

  // 1. Explicit step headers: e.g. "第一步：拆解运动条件和数据分析" or "Step 1: Parse input conditions"
  const stepRegex = /(?:(?:第[一二三四五六七八九十\d]+步|步骤\s*[\d一二三四五六七八九十]|Step\s*\d+|^\s*\d+[.、]))\s*[:：\-— ]*\s*([^\n。！？!?；;]{2,35})/gim;
  let match: RegExpExecArray | null;
  let lastStep = '';
  while ((match = stepRegex.exec(clean)) !== null) {
    if (match[1]) {
      lastStep = match[1].trim();
    }
  }
  if (lastStep) return sanitizeSummaryStep(lastStep);

  // 2. Goal / Intent markers: e.g. "我们需要拆解运动条件和数据分析" or "首先分析解析函数路径无关性"
  const intentRegex = /(?:(?:首先|其次|接下来|然后|现在|开始|我们需要|正在|先)\s*[,，:：]?\s*(?:进行|来|去)?\s*([^\n。！？!?；;]{3,35}))/gim;
  let lastIntent = '';
  while ((match = intentRegex.exec(clean)) !== null) {
    if (match[1]) {
      lastIntent = match[1].trim();
    }
  }
  if (lastIntent) return sanitizeSummaryStep(lastIntent);

  // 3. Action verbs at sentence start: e.g. "拆解运动条件和数据分析"
  const actionRegex = /(?:^|[。\n！？!?])\s*(?:(?:分析|推导|计算|梳理|拆解|建立|求解|验证|证明|解析|定义|对比|检查|总结)\s*(?:一下|相关)?([^\n。！？!?；;]{2,30}))/gim;
  let lastAction = '';
  while ((match = actionRegex.exec(clean)) !== null) {
    if (match[1]) {
      const whole = match[0].replace(/^[。\n！？!?\s]+/, '').trim();
      const cut = whole.split(/[。\n！？!?；;]/)[0].trim();
      if (cut.length >= 2 && cut.length <= 35) {
        lastAction = cut;
      }
    }
  }
  if (lastAction) return sanitizeSummaryStep(lastAction);

  // 4. Fallback to latest thought snippet
  const sentences = clean.split(/(?<=[。\n！？!?])/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length) {
    const candidate = sentences[sentences.length - 1];
    const stripped = candidate.replace(/[#*`>~_-]/g, '').trim();
    if (stripped.length >= 2) {
      return sanitizeSummaryStep(stripped.length > 35 ? stripped.slice(0, 35).trim() + '…' : stripped);
    }
  }

  return '';
}

/**
 * Generate a concise, stable upfront task summary from the user's prompt
 * before thinking or tool execution begins.
 */
export function generateInitialTaskSummary(userPrompt: string): string {
  if (!userPrompt || typeof userPrompt !== 'string') return '';
  const text = userPrompt.trim()
    .replace(/^<[^>]+>/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .trim();
  if (!text) return '';

  // 1. Math / Physics / STEM problem conditions
  if (/解析函数.*路径无关/i.test(text)) {
    return '解析函数路径无关性的说明。';
  }
  if (/(?:运动|小球|自由落体|加速度|速度|位移|受力|滑块|斜面|牛顿|动量|能量守恒).*(?:求|计算|分析|已知)/i.test(text) ||
      /(?:已知|求).*(?:运动|小球|自由落体|加速度|速度|位移|受力|滑块|斜面)/i.test(text)) {
    return '拆解运动条件和数据分析。';
  }
  if (/(?:微分方程|偏微分|ODE|PDE)/i.test(text)) {
    return '微分方程求解与推导。';
  }
  if (/(?:定积分|不定积分|重积分|二重积分|三重积分|格林公式|高斯公式|斯托克斯)/i.test(text)) {
    return '积分计算与定理性质推导。';
  }
  if (/(?:求导|导数|偏导数|极值|拐点|泰勒公式)/i.test(text)) {
    return '函数导数推导与极值分析。';
  }
  if (/(?:证明|推导).*(?:定理|公式|结论|猜想)/i.test(text) || /(?:定理|公式).*(?:证明|推导)/i.test(text)) {
    return '数学定理与公式推导分析。';
  }
  if (/(?:线性代数|矩阵|特征值|特征向量|行列式|逆矩阵)/i.test(text)) {
    return '矩阵特征与线性代数求解。';
  }

  // 2. Programming / Code
  if (/(?:写一个|编写|实现|开发).*(?:爬虫|spider|crawler)/i.test(text)) {
    return '爬虫方案设计与代码实现。';
  }
  if (/(?:快速排序|二分查找|冒泡排序|红黑树|动态规划|贪心|DFS|BFS|算法).*(?:实现|写|复杂度|分析)?/i.test(text)) {
    const algMatch = text.match(/(快速排序|二分查找|冒泡排序|红黑树|动态规划|贪心算法|DFS|BFS)/i);
    return `${algMatch ? algMatch[1] : '核心算法'}实现与逻辑分析。`;
  }
  if (/(?:写一个|编写|实现|开发).*(?:代码|函数|组件|脚本|程序|API|接口)/i.test(text)) {
    return '需求功能梳理与代码实现。';
  }
  if (/(?:优化|调优|性能).*(?:查询|SQL|数据库|MySQL|前端|代码)/i.test(text)) {
    return '性能瓶颈定位与优化方案。';
  }
  if (/(?:bug|报错|error|exception|排查|解决).*(?:问题|原因)?/i.test(text)) {
    return '异常错误定位与修复分析。';
  }

  // 3. Question / Concept / Comparison patterns
  if (/(?:区别|不同|对比|比较).*(?:是什么|有哪些|何在)?/i.test(text)) {
    const cleanQ = text.replace(/^(?:请问|请教|帮我|想知道)?\s*/, '')
      .replace(/[?？。!！\s]+$/, '')
      .replace(/^(?:分析|对比|比较|说说)\s*/, '');
    return `${cleanQ.slice(0, 18)}对比与差异分析。`;
  }
  if (/(?:为什么|为何|原因).*(?:是|成因)?/i.test(text)) {
    const cleanQ = text.replace(/^(?:请问|请教|帮我|想知道)?\s*/, '')
      .replace(/[?？。!！\s]+$/, '')
      .replace(/^(?:为什么|为何)\s*/, '');
    return `${cleanQ.slice(0, 16)}成因与机理剖析。`;
  }
  if (/(?:如何评价|怎么看待|怎样评价|如何看待)/i.test(text)) {
    const cleanQ = text.replace(/^(?:请问|请教|想知道)?\s*(?:如何评价|怎么看待|怎样评价|如何看待)\s*/, '')
      .replace(/[?？。!！\s]+$/, '');
    return `${cleanQ.slice(0, 14)}深度剖析与评价。`;
  }
  if (/(?:什么是|何为|解释一下|介绍一下|概述)/i.test(text)) {
    const cleanQ = text.replace(/^(?:请问|请教|请|帮我|介绍一下|解释一下|说说|概述)?\s*/, '')
      .replace(/^(?:什么是|何为)\s*/, '')
      .replace(/[?？。!！\s]+$/, '');
    return `${cleanQ.slice(0, 16)}核心概念与原理解析。`;
  }
  if (/(?:怎么做|如何|怎样).*(?:做|搞|弄|办|解决|处理)/i.test(text)) {
    const cleanQ = text.replace(/^(?:请问|请教|请|帮我)?\s*/, '')
      .replace(/^(?:怎么|如何|怎样)\s*/, '')
      .replace(/[?？。!！\s]+$/, '');
    return `${cleanQ.slice(0, 16)}实现方案与操作建议。`;
  }

  // 4. General fallback: extract core topic and format
  let topic = text
    .replace(/^(?:请问|请教一下|想请教|请帮我|帮我|你可以帮我|我想了解|我想知道|请说明|请解释|请阐述|请教|请分析|请|能否|可以告诉我|告诉我|说说)\s*/i, '')
    .replace(/(?:呢|吗|吧|呀|啊|哦|嘛|求解答|求教|谢谢|感谢|具体怎么做|详细说说)[？?。!！\s]*$/i, '')
    .replace(/[？?。!！\s]+$/, '')
    .trim();

  if (topic.length > 20) {
    topic = topic.slice(0, 20).trimEnd() + '…';
  }
  if (topic.length >= 2) {
    return `${topic}相关解析与说明。`;
  }

  return '问题分析与解答准备。';
}

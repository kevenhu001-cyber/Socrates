import { decodeEntities, stripTags } from './helpers.js';
import {
  parseDefinitionInner,
  parseDerivationInner,
  parseFlashcardInner,
  parseKeyPointInner,
  parseProofInner,
  parseTheoremInner,
} from './widgetParsers.js';

function fallback(inner, t, esc) {
  return '<div class="inline-block-fallback"><div class="inline-block-fallback-label">'
    + t('tutor.fallbackWarn')
    + '</div><pre class="inline-block-fallback-content">'
    + esc(inner)
    + '</pre></div>';
}

function replaceBlocks(text, expression, parse, makeSlot, placeholders, t, esc) {
  let match;
  let index = 0;
  while ((match = expression.exec(text)) !== null) {
    const parsed = parse(match[1]);
    if (!parsed) {
      const replacement = fallback(match[1], t, esc);
      text = text.slice(0, match.index) + '\n\n' + replacement + '\n\n' + text.slice(expression.lastIndex);
      expression.lastIndex = match.index + replacement.length + 4;
      continue;
    }
    const id = `${makeSlot.prefix}-${++index}-${Math.random().toString(36).slice(2, 7)}`;
    const slot = makeSlot(id);
    text = text.slice(0, match.index) + '\n\n' + slot + '\n\n' + text.slice(expression.lastIndex);
    expression.lastIndex = match.index + slot.length + 4;
    placeholders.push({ id, parsed });
  }
  return text;
}

/** Extract the non-interactive scaffold tags from assistant markdown. */
export function extractScaffoldWidgets(source, { t, esc }) {
  let text = source;
  const definitionPH = [];
  const stepPH = [];
  const flashcardPH = [];
  const derivationPH = [];
  const proofPH = [];
  const theoremPH = [];
  const keyPointPH = [];

  text = replaceBlocks(
    text,
    /<definition\b[^>]*>([\s\S]*?)<\/definition>/gi,
    parseDefinitionInner,
    Object.assign((id) => `<div class="definition-slot" data-definition-id="${id}"></div>`, { prefix: 'def' }),
    definitionPH,
    t,
    esc,
  );

  const stepRe = /<step\b([^>]*?)>([\s\S]*?)<\/step>/gi;
  let stepMatch;
  let stepIndex = 0;
  while ((stepMatch = stepRe.exec(text)) !== null) {
    const attrs = stepMatch[1] || '';
    const numberMatch = attrs.match(/n="([^"]+)"/i);
    let n = numberMatch ? Number.parseInt(numberMatch[1], 10) : stepIndex + 1;
    const body = stripTags(decodeEntities(stepMatch[2].trim()));
    if (!Number.isFinite(n) || n < 1) n = stepIndex + 1;
    if (!body) {
      const replacement = fallback(stepMatch[2], t, esc);
      text = text.slice(0, stepMatch.index) + '\n\n' + replacement + '\n\n' + text.slice(stepRe.lastIndex);
      stepRe.lastIndex = stepMatch.index + replacement.length + 4;
      continue;
    }
    const id = `step-${++stepIndex}-${Math.random().toString(36).slice(2, 7)}`;
    const slot = `<div class="step-slot" data-step-id="${id}"></div>`;
    text = text.slice(0, stepMatch.index) + '\n\n' + slot + '\n\n' + text.slice(stepRe.lastIndex);
    stepRe.lastIndex = stepMatch.index + slot.length + 4;
    stepPH.push({ id, parsed: { n, body } });
  }

  text = replaceBlocks(
    text,
    /<flashcard\b[^>]*>([\s\S]*?)<\/flashcard>/gi,
    parseFlashcardInner,
    Object.assign((id) => `<div class="flashcard-slot" data-flashcard-id="${id}"></div>`, { prefix: 'fc' }),
    flashcardPH,
    t,
    esc,
  );
  text = replaceBlocks(
    text,
    /<derivation\b[^>]*>([\s\S]*?)<\/derivation>/gi,
    parseDerivationInner,
    Object.assign((id) => `<div class="derivation-slot" data-derivation-id="${id}"></div>`, { prefix: 'der' }),
    derivationPH,
    t,
    esc,
  );
  text = replaceBlocks(
    text,
    /<proof\b[^>]*>([\s\S]*?)<\/proof>/gi,
    parseProofInner,
    Object.assign((id) => `<div class="proof-slot" data-proof-id="${id}"></div>`, { prefix: 'prf' }),
    proofPH,
    t,
    esc,
  );

  const theoremRe = /<theorem\b[^>]*>([\s\S]*?)<\/theorem>/gi;
  let theoremMatch;
  let theoremIndex = 0;
  while ((theoremMatch = theoremRe.exec(text)) !== null) {
    const inner = theoremMatch[1];
    const proofMatch = inner.match(/<proof\b[^>]*>([\s\S]*?)<\/proof>/i);
    const proof = proofMatch ? parseProofInner(proofMatch[1]) : null;
    const parsed = parseTheoremInner(inner.replace(/<proof\b[^>]*>[\s\S]*?<\/proof>/gi, ''));
    if (!parsed) {
      const replacement = fallback(inner, t, esc);
      text = text.slice(0, theoremMatch.index) + '\n\n' + replacement + '\n\n' + text.slice(theoremRe.lastIndex);
      theoremRe.lastIndex = theoremMatch.index + replacement.length + 4;
      continue;
    }
    if (proof) {
      parsed.proofTitle = proof.title;
      parsed.proofBody = proof.body;
    }
    const id = `thm-${++theoremIndex}-${Math.random().toString(36).slice(2, 7)}`;
    const slot = `<div class="theorem-slot" data-theorem-id="${id}"></div>`;
    text = text.slice(0, theoremMatch.index) + '\n\n' + slot + '\n\n' + text.slice(theoremRe.lastIndex);
    theoremRe.lastIndex = theoremMatch.index + slot.length + 4;
    theoremPH.push({ id, parsed });
  }

  text = replaceBlocks(
    text,
    /<key-point\b[^>]*>([\s\S]*?)<\/key-point>/gi,
    parseKeyPointInner,
    Object.assign((id) => `<div class="key-point-slot" data-key-point-id="${id}"></div>`, { prefix: 'kp' }),
    keyPointPH,
    t,
    esc,
  );

  return { text, definitionPH, stepPH, flashcardPH, derivationPH, proofPH, theoremPH, keyPointPH };
}

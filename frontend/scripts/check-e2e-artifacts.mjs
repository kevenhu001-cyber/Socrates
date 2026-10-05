/**
 * scripts/check-e2e-artifacts.mjs — e2e screenshots must stay in the run dir.
 *
 * Playwright's own artifact directory (`test-results/`, gitignored) is where
 * screenshots belong. Hardcoded machine paths break on other runners and
 * leave artifacts outside the current run. This AST-based check inspects the
 * actual `path` option passed to screenshot calls and only accepts paths that
 * can be shown to stay beneath `test-results/`.
 *
 * Screenshots with no explicit path are fine — Playwright keeps them in-run.
 * Dynamic path fragments must use `encodeURIComponent` and stay inside a
 * filename segment so they cannot introduce path separators or traversal.
 *
 * Usage: node scripts/check-e2e-artifacts.mjs [--update]
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const FRONTEND = fileURLToPath(new URL('..', import.meta.url));
const E2E = join(FRONTEND, 'e2e');
const BASELINE = join(FRONTEND, 'scripts', 'e2e-artifacts.baseline.json');
const UPDATE = process.argv.includes('--update');
const ALLOWED_ROOT = 'test-results/';

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'test-results') continue;
      walk(full, out);
    } else if (/\.(mjs|js|ts)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function unwrapExpression(node) {
  while (
    ts.isParenthesizedExpression(node)
    || ts.isAsExpression(node)
    || ts.isTypeAssertionExpression(node)
    || ts.isSatisfiesExpression(node)
    || ts.isNonNullExpression(node)
  ) node = node.expression;
  return node;
}

function isTextLiteral(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

function flattenPathExpression(node, parts = []) {
  node = unwrapExpression(node);
  if (isTextLiteral(node)) {
    parts.push({ text: node.text });
    return parts;
  }
  if (ts.isTemplateExpression(node)) {
    parts.push({ text: node.head.text });
    for (const span of node.templateSpans) {
      parts.push({ expression: span.expression });
      parts.push({ text: span.literal.text });
    }
    return parts;
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    flattenPathExpression(node.left, parts);
    flattenPathExpression(node.right, parts);
    return parts;
  }
  parts.push({ expression: node });
  return parts;
}

function isEncodedFragment(node) {
  node = unwrapExpression(node);
  return ts.isCallExpression(node)
    && ts.isIdentifier(node.expression)
    && node.expression.text === 'encodeURIComponent';
}

function safePathExpression(node) {
  const parts = flattenPathExpression(node);
  const firstText = parts.find((part) => Object.hasOwn(part, 'text'))?.text;
  if (typeof firstText !== 'string' || !firstText.replaceAll('\\', '/').startsWith(ALLOWED_ROOT)) {
    return false;
  }

  /* Dynamic values must not be able to add a separator. Even an encoded
     value cannot be the only contents of a path segment: an empty value could
     otherwise leave a literal `.` or `..` segment behind. */
  const segments = [{ text: '' }];
  for (const part of parts) {
    if (Object.hasOwn(part, 'expression')) {
      if (!isEncodedFragment(part.expression)) return false;
      continue;
    }
    const normalized = part.text.replaceAll('\\', '/');
    for (const char of normalized) {
      if (char === '/') segments.push({ text: '' });
      else segments.at(-1).text += char;
    }
  }

  if (segments.length < 2 || segments[0].text !== 'test-results') return false;
  return segments.every((segment) => segment.text.length > 0
    && segment.text !== '.'
    && segment.text !== '..');
}

function propertyName(node) {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) return node.text;
  if (ts.isComputedPropertyName(node) && isTextLiteral(node.expression)) return node.expression.text;
  return null;
}

function screenshotPathIsSafe(call) {
  if (call.arguments.length === 0) return true;
  const options = unwrapExpression(call.arguments[0]);
  if (!ts.isObjectLiteralExpression(options)) return false;

  const pathValues = [];
  for (const property of options.properties) {
    if (ts.isSpreadAssignment(property)) return false;
    if (!('name' in property) || !property.name) continue;

    const name = propertyName(property.name);
    if (name === null) return false;
    if (name !== 'path') continue;

    if (ts.isPropertyAssignment(property)) pathValues.push(property.initializer);
    else return false;
  }

  return pathValues.every(safePathExpression);
}

function isScreenshotCall(node) {
  if (!ts.isCallExpression(node)) return false;
  const expression = node.expression;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text === 'screenshot';
  if (ts.isElementAccessExpression(expression)) {
    return expression.argumentExpression
      && isTextLiteral(expression.argumentExpression)
      && expression.argumentExpression.text === 'screenshot';
  }
  return ts.isIdentifier(expression) && expression.text === 'screenshot';
}

function collect() {
  const offenders = [];
  for (const file of walk(E2E)) {
    const rel = relative(E2E, file).split(sep).join('/');
    const raw = readFileSync(file, 'utf8');
    const scriptKind = file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
    const source = ts.createSourceFile(file, raw, ts.ScriptTarget.Latest, true, scriptKind);

    function visit(node) {
      if (isScreenshotCall(node) && !screenshotPathIsSafe(node)) {
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        offenders.push(`${rel}:${line}: screenshot path is outside or cannot be proven under ${ALLOWED_ROOT}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return offenders.sort();
}

function main() {
  const offenders = collect();
  if (UPDATE || !existsSync(BASELINE)) {
    /* Ratchet in the same direction as the other checks: the baseline may
       only shrink. */
    const previous = existsSync(BASELINE)
      ? JSON.parse(readFileSync(BASELINE, 'utf8'))
      : null;
    const count = previous && typeof previous.count === 'number'
      ? Math.min(previous.count, offenders.length)
      : offenders.length;
    writeFileSync(BASELINE, JSON.stringify({
      count,
      note: `e2e screenshots with paths outside or not provably under ${ALLOWED_ROOT}. May only go down.`,
      generatedBy: 'check-e2e-artifacts.mjs --update',
    }, null, 2) + '\n');
    console.log(`e2e-artifacts: baseline ${previous ? 'updated' : 'written'} (count=${count}).`);
    return;
  }

  const allowed = JSON.parse(readFileSync(BASELINE, 'utf8')).count;
  if (offenders.length > allowed) {
    console.error(`e2e-artifacts FAILED: ${offenders.length} unsafe or unverifiable screenshot paths, ${allowed} allowed.`);
    for (const offender of offenders) console.error(`  - ${offender}`);
    console.error(`Use a path under ${ALLOWED_ROOT}, or omit the path to let Playwright manage the artifact.`);
    process.exit(1);
  }
  console.log(`e2e-artifacts check passed (${offenders.length}/${allowed} allowed).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

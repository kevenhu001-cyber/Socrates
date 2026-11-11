/* Safe expression parsing and bounded sampling for function visualizations. */

// A small expression language avoids eval while covering the expected
// elementary functions. The parser returns a pure evaluator f(x).
export function parseFunctionExpression(source) {
  var input = String(source || '').replace(/\s+/g, '');
  var index = 0;
  var functions = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos,
    atan: Math.atan, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, exp: Math.exp,
    ln: Math.log, log: Math.log10 || function (x) { return Math.log(x) / Math.LN10; },
    sqrt: Math.sqrt, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round,
  };
  function peek() { return input[index] || ''; }
  function consume(ch) { if (peek() === ch) { index += 1; return true; } return false; }
  function fail(message) { throw new Error(message + ' at character ' + (index + 1)); }
  function binary(left, right, operator) {
    if (operator === '+') return function (x) { return left(x) + right(x); };
    if (operator === '-') return function (x) { return left(x) - right(x); };
    if (operator === '*') return function (x) { return left(x) * right(x); };
    if (operator === '/') return function (x) { return left(x) / right(x); };
    return function (x) { return Math.pow(left(x), right(x)); };
  }
  function expression() {
    var left = term();
    while (peek() === '+' || peek() === '-') {
      var operator = input[index++], right = term();
      left = binary(left, right, operator);
    }
    return left;
  }
  function term() {
    var left = unary();
    while (peek() === '*' || peek() === '/') {
      var operator = input[index++], right = unary();
      left = binary(left, right, operator);
    }
    return left;
  }
  function power() {
    var left = atom();
    if (consume('^')) {
      var right = unary();
      return binary(left, right, '^');
    }
    return left;
  }
  function unary() {
    if (consume('+')) return unary();
    if (consume('-')) { var value = unary(); return function (x) { return -value(x); }; }
    return power();
  }
  function atom() {
    if (consume('(')) { var nested = expression(); if (!consume(')')) fail('Expected )'); return nested; }
    var number = input.slice(index).match(/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i);
    if (number) { index += number[0].length; var numeric = Number(number[0]); return function () { return numeric; }; }
    var identifier = input.slice(index).match(/^[A-Za-z][A-Za-z0-9_]*/);
    if (!identifier) fail('Expected a number, x, constant, or function');
    var name = identifier[0].toLowerCase(); index += identifier[0].length;
    if (name === 'x') return function (x) { return x; };
    if (name === 'pi') return function () { return Math.PI; };
    if (name === 'e') return function () { return Math.E; };
    if (!functions[name]) fail('Unsupported function ' + name);
    if (!consume('(')) fail('Expected ( after ' + name);
    var argument = expression(); if (!consume(')')) fail('Expected ) after ' + name);
    return function (x) { return functions[name](argument(x)); };
  }
  var evaluator = expression();
  if (index !== input.length) fail('Unexpected token ' + peek());
  return evaluator;
}

function defaultDomain(expression) {
  var source = String(expression).toLowerCase();
  if (/\b(?:ln|log|sqrt)\s*\(/.test(source)) return [0, 10];
  if (/\btan\s*\(/.test(source)) return [-Math.PI, Math.PI];
  return [-10, 10];
}

export function robustExtent(values) {
  var finite = values.filter(Number.isFinite).sort(function (a, b) { return a - b; });
  if (!finite.length) return [-1, 1];
  var low = finite[Math.floor((finite.length - 1) * 0.02)];
  var high = finite[Math.ceil((finite.length - 1) * 0.98)];
  if (!Number.isFinite(low) || !Number.isFinite(high)) return [-1, 1];
  if (low === high) { var unit = Math.abs(low) || 1; return [low - unit, high + unit]; }
  var pad = (high - low) * 0.12;
  return [low - pad, high + pad];
}

export function sampleFunction(expression, domain, count) {
  var evaluator = parseFunctionExpression(expression);
  var selectedDomain = Array.isArray(domain) ? domain : defaultDomain(expression);
  var start = selectedDomain[0], end = selectedDomain[1], samples = Math.round(Math.max(120, Math.min(1600, Number.isFinite(count) ? count : 720)));
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) throw new Error('Function domain must have two increasing finite values');
  var points = [], values = [], previous = null;
  for (var i = 0; i < samples; i++) {
    var x = start + (end - start) * i / (samples - 1), y;
    try { y = evaluator(x); } catch (_) { y = NaN; }
    // Probe inside the interval: a pole must not become a connecting stroke,
    // and a steep continuous line must not lose all its measurements.
    var discontinuous = false;
    if (previous != null && Number.isFinite(y)) {
      var previousX = points[points.length - 1][0];
      var midpoint = evaluator(previousX + (x - previousX) / 2);
      var scale = Math.max(1e-12, Math.abs(y - previous));
      discontinuous = !Number.isFinite(midpoint) || (
        Math.abs(midpoint - (y + previous) / 2) > scale * 4
        && Math.abs(midpoint) > Math.max(Math.abs(previous), Math.abs(y), 1e-12) * 2
      );
      // Opposite, diverging slopes near an off-grid pole.
      if (!discontinuous && previous * y < 0) {
        var quarter = evaluator(previousX + (x - previousX) / 4);
        var threeQuarter = evaluator(previousX + 3 * (x - previousX) / 4);
        discontinuous = !Number.isFinite(quarter) || !Number.isFinite(threeQuarter)
          || Math.max(Math.abs(quarter), Math.abs(threeQuarter)) > Math.max(Math.abs(previous), Math.abs(y)) * 2
          || (quarter - previous) * (y - previous) < 0
          || (y - threeQuarter) * (y - previous) < 0;
      }
    }
    if (!Number.isFinite(y) || discontinuous) {
      points.push([x, null]); previous = null;
    } else {
      points.push([x, y]); values.push(y); previous = y;
    }
  }
  return { points: points, extent: robustExtent(values), domain: selectedDomain, evaluator: evaluator };
}


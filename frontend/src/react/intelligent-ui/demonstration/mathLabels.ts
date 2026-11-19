const legacyAxes = new Map([
  ['θ / θR', '\\(\\theta / \\theta_R\\)'],
  ['I / I₀', '\\(I / I_0\\)'],
  ['d · sinθ / 550 nm', '\\(d \\cdot \\sin\\theta / (550\\,\\mathrm{nm})\\)'],
  ['d sinθ / λ', '\\(d \\sin\\theta / \\lambda\\)'],
  ['xₙ', '\\(x_n\\)'],
  ['代数 n', '代数 \\(n\\)'],
]);

const axisQuantity = /^([a-z](?:\([a-z]\))?|[θω])(?: \(([a-z]+(?:\/[a-z]+)?|°)\))?$/i;

/** Recognize short physics notation in older axis labels and preserve prose. */
export function demoAxisLabel(label = ''): string {
  const text = label.trim().replace(/\s+/g, ' ');
  const legacy = legacyAxes.get(text);
  if (legacy) return legacy;
  const match = axisQuantity.exec(text);
  if (!match) return label;
  const [, symbol, unit] = match;
  const quantity = symbol === 'θ' ? '\\theta' : symbol === 'ω' ? '\\omega' : symbol;
  const unitTex = unit === '°' ? '{}^\\circ' : `\\mathrm{${unit}}`;
  return `\\(${quantity}${unit ? `\\,(${unitTex})` : ''}\\)`;
}

export function demoUnit(unit: string): string {
  return unit === 'θR' ? '\\(\\theta_R\\)' : unit;
}

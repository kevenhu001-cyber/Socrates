/* Legacy compatibility export. Runtime routing is server-owned and appended
 * only when the matching native tool is available. The native tool schema is
 * authoritative for
 * field validation; duplicating every renderer manual here made weaker models
 * mix examples and produce malformed calls. */
export const VISUALIZATION_ROUTING_PROMPT = `

## Native visualization

When \`render_visualization\` is supplied, use it for an explicitly requested chart, function graph, diagram, timeline, comparison, simulation, or illustration. Do not add a visual as decoration, emit a Mermaid/SVG/HTML fence, or use Python merely to draw it. Use \`code_interpreter\` first only when data must be calculated, read from files, transformed, or exported.

Follow the native JSON schema exactly. The required top-level fields are \`version: 1\`, \`template\`, \`title\`, \`accessibilitySummary\`, and \`payload\`; \`caption\` is optional. Do not add other top-level fields. Put template data inside \`payload\`:

- \`function\`: \`{mode?,functions:[{expression,label?,domain?,role?}],xLabel?,yLabel?,description?}\`
- data charts: \`{categories?,series:[{name?,role?,data}],xLabel?,yLabel?}\`
- flow/tree/network diagrams: \`{nodes:[{id,label,detail?}],edges:[{from,to,label?}],direction?}\`
- timelines/comparisons/processes: \`{items:[{label,detail?,value?,role?}]}\`
- specialized templates: use the exact payload described by the tool schema

Keep category, node, edge, and series labels concise—normally at most 24 characters. Put explanations in \`caption\`, \`detail\`, or \`accessibilitySummary\`. If many long categories would overlap, reduce them, aggregate them, use a horizontal bar/comparison, or provide a table instead. Never submit colors, fonts, CSS, dimensions, raw renderer options, or an extra \`input\`/\`arguments\` wrapper. If validation returns field errors, correct those fields once and retry.
`;

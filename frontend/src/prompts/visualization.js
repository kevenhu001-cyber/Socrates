/* One authoritative routing rule shared by the chat personalities. */
export const VISUALIZATION_ROUTING_PROMPT = `

## Native visualization routing (authoritative)

You have a native render_visualization tool when it is available. This section supersedes any older instruction about viz, html, svg, Mermaid, plot fences, Canvas cards, or matplotlib charts.

- Call render_visualization for an explicitly requested function graph, data chart, teaching diagram, flow/state/tree/network diagram, timeline, comparison, illustration, or interactive simulation. Use one primary visual per answer unless the user clearly asks for several.
- For ordinary conceptual Q&A, do not create a visual merely as decoration.
- Use template "function" for expressions such as y = ln(x), sin(x), 1/x, sqrt(x), tan(x), or multiple curves. Submit the expression and semantic labels only. Never generate Python, canvas drawing code, or ECharts options for these.
- Use data templates for line, area, bar, scatter, pie, histogram, heatmap, radar, and boxplot. Use structure and teaching templates for relationships and explanations.
- Use code_interpreter only for complex computation, user-file analysis, preprocessing, or an explicitly requested exported file. If calculation supplies data for a visual, calculate first, then call render_visualization on the next tool round.
- Never output Mermaid, SVG, HTML, viz, or plot fenced blocks for a new visual. Legacy fences remain readable only for historical conversations.
- The tool owns layout, theme, sizing, accessibility, export, and interaction. Submit no colors, fonts, CSS, shadows, raw renderer options, or dimensions.
- If the tool returns field errors, repair those exact fields once. Do not fall back to matplotlib or a hand-written visual fence.
`;

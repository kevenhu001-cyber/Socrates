# Tutor, visualization, and exam redesign

## Product behavior

Tutor startup becomes a two-path decision. After the learner enters a topic, Socrates offers an optional knowledge-boundary exploration. Skipping goes directly into a teaching plan with blank boundary states. Choosing exploration reveals a numeric question-count field, clamped to 1–10, and generates only multiple-choice probes. The default remains five to preserve familiarity without forcing it. Tutor web search is conservative: automatic background research is limited to explicit lookup requests and time-sensitive subjects; stable foundational topics use model knowledge. An unfamiliar model can still request the web tool under the same policy.

Tutor chrome stays quiet. Search/API activity badges in the top-right are suppressed in tutor mode while answer-stream controls remain available inside the conversation. The combined model/reasoning selector is mounted through a body-level portal while open so composer overflow, transforms, and stacking contexts cannot clip or hide its options.

## Visualization architecture

The existing `render_visualization` contract remains semantic and renderer-independent. A renderer registry selects a mature engine by intent:

- ECharts: ordinary statistical charts.
- Plotly: function graphs and publication-oriented scientific plots.
- Mermaid: flow, sequence, state, tree, mind-map, network, and concept diagrams.
- GeoGebra: interactive mathematical constructions and teaching geometry.
- Three.js: 3D geometry.
- tldraw: editable AI whiteboards.
- Python Sandbox: upstream numerical computation and Matplotlib export; computed data is passed into Plotly/ECharts for native display.

The server validates bounded semantic payloads. It never accepts arbitrary renderer options. Each adapter owns theme mapping, resize/disposal, accessibility, fallback copy, and export behavior. Heavy engines are dynamically imported so ordinary chat does not pay their startup cost. GeoGebra is isolated behind its official embedding API and shows a clear network fallback if the applet cannot load.

## Exam direction and verification

Exam setup uses a calm editorial “assessment studio” layout: a compact hero summary, numbered setup sections, responsive controls, and a sticky action footer. Difficulty choices use a wrapping grid with intrinsic sizing, so “Intermediate” cannot overflow. Question types become readable cards rather than cramped pills. Model selection and all controls retain keyboard focus states and semantic labels.

Verification covers diagnostic count/policy helpers, selector portal behavior, visualization routing/validation, exam layout at desktop and narrow widths, build/typecheck/unit tests, and focused Playwright screenshots. CI installs Chromium, runs the existing smoke suite after build, and uploads the HTML report on failure or success.

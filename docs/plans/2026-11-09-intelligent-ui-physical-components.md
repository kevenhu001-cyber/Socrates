# Intelligent UI physical composition

All new visuals continue through `render_intelligent_ui`. Native chart nodes and
OpenUI Visualization components now share `NativeVisualization`: normalization,
engine mounting, in-place updates, loading, disposal and repair. The native chart
adapter retains its state expressions and renders the documented 50 points
(previously silently truncated to 16). Historical visualization tool calls and
existing physics scene IDs remain readable.

A mathematical demonstration can now compose a `scene` view alongside plots,
fields, trajectories, controls and metrics. It declares x/y bounds and 1–32 objects:

- `body`: center coordinate pair and positive radius.
- `block`: center, positive width/height, optional angle in radians.
- `rod`, `spring`, `vector`: from/to coordinate pairs.

Every coordinate, size and angle can be a mathematical expression using the same
parameters, definitions, ODE state and time as the other views. Labels and colors
use existing scientific typography and theme tokens. The renderer preserves
physical aspect ratio with an upward y-axis, bounded geometry, clipped drawing,
and per-object diagnostics; invalid geometry leaves other objects and controls
available, and correcting inputs restores it. Springs show schematic connections;
force laws must be authored in the mathematical model. Vector scales must be
explained by their labels. There is no implicit collision/contact/PDE solver.

[Portable programs](../examples/intelligent-ui-physics.json) demonstrate a spring
mass with force and energy readouts, a nonlinear pendulum with linked trajectory,
and circular kinematics with a tangent velocity vector. These are ordinary model
data, requiring no new physics model IDs or renderer pages.

The tool schema, shared normalization/validation, retry guidance and OpenAPI chat
description carry the additive contract. Shared packages remain DOM-free;
Universal App and Android keep their existing generic tool-result fallback and
unknown-field preservation. This adds the scene renderer to the Vite baseline;
native scene rendering in the Universal App is not included. No dependency,
database migration, credential or deployment change is required. Deploy server
and frontend together; rollback both to restore the previous validation contract.

Verification on 2026-11-09: frontend lint checks (rerunning only affected guards
after corrections), typecheck, production build and bundle-size guard passed;
35 focused frontend unit cases and 28 server cases passed. Server typecheck,
production build and service boundaries passed; server tests ran with database
access disabled. Universal App typecheck and the shared DOM guard passed.
Twenty relevant Playwright cases passed across the algorithmic demonstration,
physical composition, showcase and selected OpenUI suites. Light desktop and
dark phone screenshots were inspected; the full light/dark desktop/phone matrix
is exercised by fixtures. Browser plugin was not available, so validation used
repository Playwright against the production build. No live model generation or
deployment was performed. Public OpenAPI projection and its tests were checked.

## Unified physics format and editable examples

New physical content uses one wire shape:
`{version:1,nodes:[{id,type:"demonstration",title,program:{version:1,...}}]}`.
The old six physics scene IDs and OpenUI Rayleigh now adapt to that same program
renderer. Their wire fields remain accepted; their separate Canvas/playback,
controls, graph and metric implementations are removed. Historical Rayleigh
keeps its optical controls and comparison preset; it uses explicit parameter
changes rather than automatically moving the source-separation slider. The
common reduced-motion, streaming, parameter-patch and error-recovery behavior
now applies to those historical nodes too.

A `path` scene object adds 2–64 expression coordinate pairs, with optional
`closed` and `dashed`, for boundaries, slopes, wires, ropes and rays. It uses the
same coordinate system and bounds as other objects. Preset values may be numbers
or expressions evaluated against current parameters/definitions at t=0. A preset
is atomic: nonfinite or out-of-range results produce a local diagnostic without
changing any parameter. Rayleigh's comparison therefore follows current
wavelength/aperture instead of a stale default.

The canonical editable catalog is `packages/core/src/physicsExamples.js`; its
portable JSON projection is `docs/examples/intelligent-ui-physics.json` (a focused
unit check verifies parity). It now contains nine models: spring oscillator,
nonlinear pendulum, prescribed circular motion, coupled oscillators, driven
damped oscillator, charged-particle motion in uniform electromagnetic fields,
Kepler orbit, RC charging, and Newton cooling. Each declares its assumptions;
normalized-unit models are explicitly distinguished from SI examples. These are
program data, not new registered scene IDs or new renderer components.

The live model prompt includes complete coupled-oscillator and electromagnetic
programs, all nine assumption summaries, and a modeling workflow: state units,
choose independent states, derive force laws and initial conditions, reuse
expressions across scene/trajectory/field/readout, and check conservation or a
limiting case. AI can change equations, parameters, initial conditions, object
geometry, views and controls within the existing budgets. No claim is made to
solve arbitrary collisions, contact, PDEs or general electrical networks.

Reference equations were checked against [TU Graz coupled-oscillator teaching
notes](https://lampz.tugraz.at/~hadley/physikm/script/oscillations/coupled.en.php), [OpenStax magnetic
motion](https://openstax.org/books/university-physics-volume-2/pages/11-3-motion-of-a-charged-particle-in-a-magnetic-field)
and [OpenStax RC circuits](https://openstax.org/books/university-physics-volume-2/pages/10-5-rc-circuits).
All examples remain approximations with the assumptions stored alongside them.

Follow-up verification: all 32 focused frontend cases, 29 server cases and 33
browser cases passed. Frontend lint (including all architecture guards), frontend
and server production builds, server typecheck/service boundaries, Universal App
typecheck, bundle budget, public OpenAPI projection and its two tests passed.
Browser coverage includes the six legacy physics IDs, stored OpenUI Rayleigh,
all nine editable examples, shared state/history, path geometry, conservation
checks and atomic expression-preset failure/recovery. Macro-example screenshots
are captured at nonzero time with the scene centered to avoid sticky chrome
obscuring the evidence. Browser plugin was unavailable; repository Playwright was
used. Tests use model-output fixtures, not live-provider generation. Nothing was
deployed.

# Algorithmic Intelligence UI

The primary interface is a **model-authored mathematical program with composed
native views**, not a menu of predefined physics scenes. Models can create new
systems and algorithms without adding a model ID or a React page.

## Existing OpenUI and public product research

The SPA maps OpenUI Lang through `@openuidev/react-lang` to a curated local React
library. The parser is a third-party dependency, not a plugin launcher. Map and
SearchImage call remote services through the API; ordinary controls, charts and
layouts render locally. Existing programs remain readable.

OpenAI's public [ChatKit widgets documentation](https://developers.openai.com/api/docs/guides/chatkit-widgets)
describes schema-driven components and actions. Anthropic's [Artifacts documentation](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them)
describes separately displayed generated documents/code and interactive content.
These establish public integration patterns, not ChatGPT/Claude's private
rendering implementation or their internal physics algorithms. The decision here
is to let models author computations and composition while the app owns rendering.

## Mathematical demonstration contract

A `render_intelligent_ui` node has `type: demonstration`, a title, and `program`:

```json
{
  "version": 1,
  "nodes": [{
    "id": "new-system",
    "type": "demonstration",
    "title": "An independently defined oscillator",
    "program": {
      "version": 1,
      "parameters": [{"id":"omega","label":"Angular frequency","value":2,"min":0.5,"max":5,"step":0.1,"unit":"rad/s"}],
      "dynamics": {
        "initial": {"q":1,"v":0},
        "derivatives": {"q":"v","v":"-omega^2*q"},
        "duration": 10,
        "step": 0.01
      },
      "views": [
        {"kind":"trajectory","x":[-1.2,1.2],"y":[-5.5,5.5],"horizontal":"q","vertical":"v","xLabel":"q","yLabel":"v"},
        {"kind":"controls"},
        {"kind":"metrics","values":[{"label":"Energy","expression":"(v^2+omega^2*q^2)/2"}]}
      ]
    }
  }]
}
```

`packages/core/src/demonstration.js` is the DOM-free parser, validator,
mathematical interpreter and generic fixed-step RK4 runtime. Its `.d.ts` describes
the shared wire contract. The compiled server imports executable shared JS, not
TypeScript outside its rootDir. The SPA renders through
`frontend/src/react/intelligence-ui/demonstration/` without OpenUI parsing.

The language supports arithmetic, comparisons, lazy `if`, trigonometric/math
functions, finite `sum`, scalar `iterate`, Bessel J1, normalized sinc and Airy
intensity. Ordered definitions are reevaluated at the current x/y/time/state.
Generic ODEs support up to six state variables; they are not tied to named models.
Initial conditions use parameter expressions, and derivatives use all current
state variables, parameters and definitions. Trajectories are prepared once per
parameter set, then interpolated for scrubbing/playback.

Axis bounds can be mathematical expressions, allowing the graph to adapt to parameter/state changes while retaining calibrated numeric ticks.

AI edits to declared parameter defaults drive the current scene directly. Unrelated manual controls survive layout/definition patches. Changing `resetKey` restores all declared defaults; fresh history mounts initialize from those persisted declarations.

The model orders views freely: multiple labeled/dashed plot curves and markers,
computed pixel fields, vector overlays, ODE trajectory projections, live metrics,
and a shared compact controls slot. All views share definitions and parameters.
The field's gamma/exposure affect display only, leaving numerical curves intact.
Two independent field windows can show different projections or quantities.
Native panels, text, tables, charts and metrics can surround the demonstration.

Resource bounds are explicit: 12 parameters, 24 definitions, 8 views, 2 pixel
fields, 12 curves, 6 ODE states, 30 simulated seconds and 10000 integration steps.
Expressions contain at most 320 tokens/1600 characters, have bounded depth,
loops contain at most 1000 terms/steps, and execution has an operation budget.

### Robust computation (2026-11-07)

Programs pass through one shared normalizer (`normalizeDemonstrationProgram`)
on the server, in validation and in the browser, so a program recovered from
prose or history gets the same repairs as a tool call: `{item: [...]}`
collections, quoted numbers, reversed or empty ranges, out-of-range defaults,
`type` instead of `kind`, curve strings and definition lists. Expressions are
normalized to the ASCII grammar (`x²`, `π`, `×`, `−`, `°`, `√`, full-width
characters, Greek letters, `**`, `Math.sin`, a leading `y =`), implicit
multiplication (`2x`, `2(x+1)`) and `cond ? a : b` are parsed, and definitions
may appear in any order with cycles rejected. Validation errors carry a path
such as `views[1].curves[0]` or `definitions.f`.

At run time a non-finite or failing sample is a gap, not a failed view; a curve
with no finite samples is named under its plot while the others draw; an axis
that cannot be evaluated is fitted to the samples; budget overruns retry at a
lower sampling density; and diverging dynamics keep the valid history and stop
the animation there with a located note. The generic "could not complete its
calculation" message only remains for a program that cannot be read at all;
during streaming such a block shows the skeleton instead.
There is no eval, generated JavaScript, shader injection, DOM access, network
access or external plugin runtime. These limits constrain work, not model IDs.
A general arbitrary-code/PDE/multiphysics solver is outside the present contract.

## Reference-driven UI and proof of generality

The supplied reference images guide the presentation: inline scientific content,
a clear plot/field hierarchy, restrained multi-curve color, dashed envelopes,
calibrated axes, minimal legends, compact label–slider–value rows, and quiet
readouts. Secondary controls are disclosed; there is no rendering-engine picker.
The model can place controls before or after the plot. Ordinary explanatory
paragraphs and equations stay outside the visualization.

[Portable example programs](../examples/algorithmic-demonstrations.json) contain:

- An unregistered diffraction grating: shared sinc envelope/interference
  definitions drive the total-intensity curve, dashed envelope and rendered
  brightness strip. Slit count, spacing ratio and wavelength update all views.
- Two Airy sources: computed light image, two component-intensity curves, total
  curve, midpoint marker, separation control and live central-intensity metric.
- An unregistered Lorenz system: model-authored differential equations generate
  a projected attractor and live state values. No Lorenz scene or React component
  was registered. This verifies freedom beyond the original physics examples.
- A Fourier partial sum of a square wave: `sum()` over up to 60 odd harmonics
  against a dashed square wave, with a live Gibbs-peak readout.
- A logistic-map orbit: `iterate()` drives a generation-by-generation curve and
  a 200-generation readout, with the fixed point as a dashed reference.
- A projectile with quadratic air drag: four-state RK4 dynamics that stop at
  the ground, a trajectory with parameter-dependent axes and live readouts.

These examples are data, not entries required by the demonstration runtime.

## Convenience physics models

`physicsModelRegistry.js` retains six reviewed scene contracts: Rayleigh,
wave interference, electric fields, damped oscillators, nonlinear pendulums and
projectiles. `physicsModels.ts` supplies reusable numerical kernels. They remain
convenient starting points and history compatibility, not the capability boundary.
Rayleigh uses equal incoherent sources, a circular pupil, additive Airy intensities
and a linear cross-section. The neutral light rendering is an intensity display,
not calibrated spectral colorimetry. The midpoint dip at Rayleigh is approximately
26.5 percent. Wave fields explicitly regularize source cores; charge cores are
excluded. Each scene states its physical assumptions and units.

Physical references: [Harvard Rayleigh demonstration](https://sciencedemonstrations.fas.harvard.edu/presentations/rayleighs-criterion),
[FSU incoherent/coherent distinction](https://micro.magnet.fsu.edu/primer/java/imageformation/rayleighdisks/index.html),
[OpenStax damped oscillations](https://openstax.org/books/university-physics-volume-1/pages/15-5-damped-oscillations),
[OpenStax point-charge potential](https://openstax.org/books/college-physics-2e/pages/19-3-electrical-potential-due-to-a-point-charge).

## Teaching and compatibility

Shared scaffold cards and streaming previews carry matching hairline frames.
Generation defaults to no definition/key-point cards. They are reserved for a
named concept, actual theorem or essential conceptual distinction, ordinarily
at most one reference card per reply; ordinary conversation stays in prose.
Tutoring selects explanations/tools proactively. Explicit legacy help messages
keep two visible controls and put secondary actions in a menu. MessageItem now
mounts the previously unreferenced help component; automatic stuck follow-ups
continue without requiring the learner to choose an action.

The wire change is additive. Shared packages remain DOM-free. Universal App and
other clients preserve unknown fields and use the existing generic tool-result
fallback until their renderer migration. No database migration, credentials, CSP
expansion or new dependency is required. Rollback requires matching server/shared
schema and frontend versions; generic historical tool results remain readable.
No deployment is performed as part of this change.

## Verification

Frontend lint/architecture guards and production build passed, as did the server
production build and Universal App typecheck. Focused frontend coverage includes
33 cases across the expression engine, physical kernels, native UI parsing and
OpenUI compatibility; focused server coverage includes 21 cases. Browser coverage
checks the seven algorithmic demonstration cases and ten convenience-model cases,
plus the previously verified tutor/scaffold/message-list regressions. Light/dark
phone/desktop images were inspected against the supplied references. Production
bundle size, OpenAPI projection and DOM/service boundaries passed.

Native tool-event coverage verifies initial rendering, streaming completion,
layout patches preserving controls, explicit AI parameter edits, resetKey and
history restoration. Field/curve consistency, Rayleigh saddle depth, generic ODE
accuracy and operation limits have numerical checks. Browser scenarios use model
output fixtures; live-provider generation quality has not been benchmarked.

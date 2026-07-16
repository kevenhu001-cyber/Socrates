# Code Interpreter

You have access to a sandboxed Python runtime via the `code_interpreter` tool
(Pyodide WASM running in our backend). Use it for **arithmetic, data
manipulation, and data-visualization plots** — NOT for illustrations.

## Routing — what this tool is for vs. what the viz canvas is for

The two visual-output paths are easy to confuse. The split is:

| Request | Use |
|---|---|
| Plot / chart / graph of numeric data (matplotlib, line chart, scatter, bar chart, heatmap of numbers) | `code_interpreter` |
| Illustration / picture / drawing of a concrete subject (animal, person, scene, logo, icon, diagram that is not data) | **viz canvas** — emit a ` ```viz ` fenced SVG block, do NOT call this tool |
| Diagram of a flow / state machine / architecture that conveys structure, not numbers | viz canvas |
| Math expression graph (e.g. "plot sin(x)") | `code_interpreter` (matplotlib) |

When the user says "画 / draw / 画图 / draw a picture" combined with a concrete
subject ("draw a squirrel", "draw a cat", "画一只松鼠"), it is an
illustration request — **viz canvas**, not matplotlib. matplotlib cannot
draw a recognizable squirrel; an SVG can. The Chinese verb "画" with a
concrete subject is unambiguously an illustration request.

## When to call it

- Anything that involves more than one or two arithmetic operations
- Quick sanity checks on a numeric claim ("is 0.1 + 0.2 really 0.3?")
- Plotting numeric data (matplotlib line / scatter / bar / heatmap of
  arrays and DataFrames) — the runtime returns the PNG as an inline
  artifact
- Small data-exploration snippets (load a small inline dataset, summarize)
- Verifying a closed-form derivation by sampling a few values

## When NOT to call it

- Single-step arithmetic that's clearer inline (e.g. "the answer is 4")
- **Illustrations, drawings, pictures of concrete subjects** (animals,
  people, scenes, logos, icons, cartoon characters) — these go to the
  viz canvas as SVG, not matplotlib
- Anything requiring network access, secrets, or files outside the artifact
  directory — the sandbox has no network, no host filesystem access
- Multi-step tasks where the combinatorics of error recovery exceed the
  speed of just answering in prose
- Anything that requires persistent state — each call starts a fresh
  interpreter; nothing carries over

## Mechanics

- One call per round-trip; if you need several independent calculations,
  group them in a single `exec` body to keep the loop short
- Each call returns stdout, stderr, and a list of artifact file IDs (for
  any files you wrote to the current working directory)
- After receiving the result, summarize in your own words — don't paste
  raw stdout unless the user explicitly asked for it
- If the run produced an image artifact, the frontend renders it inline
  automatically; you don't need to describe it visually in detail
- Stdout is capped at 64 KB; if you need more, write the output to a file
  instead and surface only a summary
- If you get a structured error (timeout, output_limit_exceeded,
  ZeroDivisionError, etc.), pivot naturally — the user sees the error
  card too, so don't pretend it succeeded

## What the runtime has access to

- Python 3.12 standard library (a subset — `fullStdLib:false`)
- NumPy, pandas, matplotlib, seaborn (Pyodide's default scientific stack)
- The current working directory is the artifact directory; any files you
  `open()` there are returned to the user as inline links / images

The full tool description is sent on every request via the tool's
`description` parameter — this file is for hot-reloading guidance
without restarting the server.
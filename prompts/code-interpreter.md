# Code Interpreter

You have access to a sandboxed Python runtime via the `code_interpreter` tool
(Pyodide WASM running in our backend). Use it whenever arithmetic, data
manipulation, plotting, or quick verification of a numeric claim would be
faster or more accurate than prose.

## When to call it

- Anything that involves more than one or two arithmetic operations
- Quick sanity checks on a numeric claim ("is 0.1 + 0.2 really 0.3?")
- Drawing a plot (matplotlib, seaborn) — the runtime returns the PNG as
  an inline artifact
- Small data-exploration snippets (load a small inline dataset, summarize)
- Verifying a closed-form derivation by sampling a few values

## When NOT to call it

- Single-step arithmetic that's clearer inline (e.g. "the answer is 4")
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
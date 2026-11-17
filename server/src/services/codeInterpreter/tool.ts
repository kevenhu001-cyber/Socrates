/**
 * Frontend-visible tool definition for the chat route.
 */
import { EXEC_RUNNER, ADVERTISED_MAX_CODE_CHARS, DEFAULT_TIMEOUT_MS, MAX_OUTPUT_BYTES } from './config.js';

/* ─── Tool definition (sent to upstream on every chat turn) ─── */
export const CODE_INTERPRETER_TOOL = {
  type: 'function',
  function: {
    name: 'code_interpreter',
    description:
      '## What this tool does\n' +
      'Executes Python 3.12 in a sandboxed Pyodide WASM runtime and returns stdout plus any matplotlib PNGs / CSV exports written to the current working directory.\n\n' +
      // P_code-must-be-module-level — the runner is
      // `exec(compile(src, "<socrates>", "exec"), {"__name__": "__main__"})`.
      // This is a SYNCHRONOUS module-level exec, not a Jupyter cell. The
      // model used to hit `SyntaxError: 'await' outside function` and
      // similar compile-time errors on the first attempt, wasting a
      // round trip. These rules are stated up-front so the model writes
      // valid Python on the first try.
      '## Source must be valid module-level Python (NOT a Jupyter cell)\n' +
      '- **No top-level `await`.** This runner is synchronous. For async work, write `async def main(): ...` and call `asyncio.run(main())`. The same applies to top-level `yield` (it must be inside a generator function).\n' +
      '- **No top-level `return value`.** `return` with a value is only valid inside a function. If you want a final result, print it.\n' +
      '- **No `break`/`continue` outside loops.** If you need early exit, use `return` inside a function or `sys.exit(N)` at the top level.\n' +
      '- **Indentation must form valid compound statements.** Every `def`, `for`, `if`, `try`, `with`, `while`, `class` needs a properly indented body. Empty bodies need `pass` or `...`.\n' +
      `- **Never call \`input()\`.** There is no stdin — it blocks until the ${DEFAULT_TIMEOUT_MS / 1000}s timeout. Pass data as a literal, read from a file in \`/artifacts\`, or generate it inline.\n` +
      '- **Never call `plt.show()`.** matplotlib is pinned to `Agg` (no GUI). Use `plt.savefig("name.png", ...)` and the file will be returned as an artifact.\n' +
      '- **Images are not displayed automatically.** If you want the user to see a generated image (PNG/JPEG/WebP), reference it explicitly in your reply with markdown: `![description](/api/files/<fileId>/raw)`. The file id is reported back in the tool result. Otherwise describe the image or result in prose.\n' +
      '- **Packages:** packages in the Pyodide distribution (numpy, pandas, matplotlib, scipy, sympy, scikit-learn, statsmodels, networkx, pillow, …) auto-install on `import` — just import them. For a PyPI-only pure-Python wheel use `import micropip, asyncio; asyncio.run(micropip.install("pkg"))` — micropip is async, so a bare `micropip.install(...)` call installs nothing. Never call `pip install` — there is no `subprocess`.\n' +
      '- **Group multi-step work in a single call.** Several independent calculations belong in one `code` body — the runner is one exec per tool call, and the per-turn tool-call budget (stated in the native-tool contract) is finite.\n\n' +
      '## When to call\n' +
      '- Arithmetic, unit conversion, numeric verification, solving an equation, "is X > Y".\n' +
      '- Complex computation, user-file analysis, data preprocessing, or explicitly requested CSV/PNG exports. For ordinary inline charts and function graphs, use render_intelligent_ui with the Visualization component instead.\n' +
      '- Small data-exploration snippets (load inline data, summarize, sample-check a derivation).\n\n' +
      '## When NOT to call\n' +
      '- Illustrations of concrete subjects (animals, people, scenes, logos, icons) — those MUST go through render_intelligent_ui with a Visualization component using the svg_illustration template. SVG output here is rejected with `illustration_not_supported`. Never use code_interpreter for illustrations.\n' +
      '- Conceptual answers, code review, prose, explanations — answer those directly in markdown.\n' +
      '- Trivial single-step arithmetic you can do in your head.\n\n' +
      `## Limits\n` +
      `- Timeout: ${DEFAULT_TIMEOUT_MS / 1000}s default. Worker is killed if exceeded → status returns \`timeout\`.\n` +
      `- stdout / stderr capped at ${MAX_OUTPUT_BYTES / 1024} KB each per stream; exceeding it returns \`output_limit_exceeded\`.\n` +
      `- Source capped at ${Math.floor(ADVERTISED_MAX_CODE_CHARS / 1024)} KB; oversized source returns \`code_too_large\` or \`invalid_tool_arguments\` before any execution. Split long programs into multiple calls.\n` +
      '- No subprocess, no network fetch from Python, no host filesystem access.\n\n' +
      '## Filesystem\n' +
      '- cwd is `/artifacts`, mapped to a session-scoped scratch dir that persists across every code call in this conversation.\n' +
      '- Each run prints a `[scratch] cwd=/artifacts, files (sorted by mtime desc):` header listing current files with size + age. READ THE HEADER before guessing any path. If the header shows no matching file, write the file yourself in the same run — do not assume it exists.\n' +
      '- Files persist; the directory is only reaped on session delete or a 14-day TTL sweep.\n\n' +
      '## State across calls\n' +
      '**Files persist. EVERYTHING ELSE DOES NOT.** Imports, function definitions, variables, module-level state — all reset between calls. Re-import or recompute anything you need; do not rely on a variable from a previous run.\n\n' +
      '## matplotlib guidance\n' +
      '- Backend is pinned to `Agg` (no display). Figures render headless.\n' +
      '- A CJK-capable font (Noto Sans SC) is pre-installed and registered at boot; Chinese / Japanese / Korean characters in titles, labels, and legends render correctly without any extra setup. Do NOT call `matplotlib.rcParams["font.sans-serif"] = […]` or `matplotlib.font_manager.fontManager.addfont(…)` — leave the defaults alone so the pre-installed font stays active.\n' +
      '- Save with `plt.savefig("name.png", dpi=120, bbox_inches="tight")` — dpi=120 keeps PNGs under ~500 KB at typical sizes; bbox_inches="tight" crops margins.\n' +
      '- Always call `plt.tight_layout()` before savefig or labels get clipped.\n' +
      '- Close figures (`plt.close("all")` or `plt.close(fig)`) after saving — otherwise memory grows across runs.\n\n' +
      '## Common errors and how to recover\n' +
      '- `SyntaxError` (any kind) → check indentation and module-level syntax. In particular, keep `await` inside an `async def` invoked with `asyncio.run(...)`.\n' +
      '- `NameError: name X is not defined` → X was a variable from a previous run. Recompute it in THIS run, do not just re-call.\n' +
      '- `ModuleNotFoundError` → the package is not in the Pyodide distribution. Install a pure-Python PyPI wheel with `import micropip, asyncio; asyncio.run(micropip.install("pkg"))` at the top of the same run, then retry the import.\n' +
      '- `FileNotFoundError` → you guessed a path without reading the `[scratch]` header. Re-read the header; if the file is not listed, write it yourself in this run.\n' +
      '- `output_limit_exceeded` → stdout was too verbose. Save the data to a file, print a summary, describe the summary.\n' +
      '- `timeout` (status field) → the work exceeded the time budget. Split into smaller runs or pre-compute what you can.\n' +
      '- Empty PNG / "figure not found" → forgot `plt.close()` from the previous run; close all figures at the top of this run.',
    parameters: {
      type: 'object',
      properties: {
        language: {
          type: 'string',
          enum: ['python'],
          default: 'python',
          description: 'Always "python" in v1.',
        },
          code: {
            type: 'string',
            description: `Python source code to execute (max ${Math.floor(ADVERTISED_MAX_CODE_CHARS / 1024)} KB — split longer programs into multiple calls). Files written to disk (matplotlib.savefig, open(..., "w"), pandas.to_csv) persist across every code call in this conversation — the scratch dir is session-scoped.`,
            maxLength: ADVERTISED_MAX_CODE_CHARS,
          },
      },
      required: ['code'],
      additionalProperties: false,
    },
  },
};


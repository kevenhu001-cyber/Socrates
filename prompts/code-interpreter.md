# Code Interpreter

## Routing

- Use `code_interpreter` for nontrivial calculation, numeric verification, data analysis, file transformation, or an explicitly requested CSV/PNG export.
- Use `render_visualization` for inline charts, function plots, diagrams, simulations, and illustrations.
- Do not use Python to draw a concrete subject, logo, scene, or teaching illustration.
- Answer conceptual questions and simple arithmetic directly when a tool would not improve correctness.

## Runtime contract

- The tool accepts module-level Python, not a notebook cell. There is no top-level `await`, stdin, shell, or network.
- For asynchronous code, define `async def main(): ...` and invoke it with `asyncio.run(main())`.
- Never call `input()`, `pip`, `subprocess`, or `plt.show()`.
- Variables and imports reset between calls. Files in `/artifacts` persist. Read the `[scratch]` file listing before assuming a path exists.
- Matplotlib uses a headless backend. Save figures with `savefig(...)`, then close them.
- Group related work into one call and keep stdout concise. Save large output as an artifact.

## Results and retries

If the tool returns a structured error, correct the specific code or arguments before one retry. Never repeat an identical failed call.

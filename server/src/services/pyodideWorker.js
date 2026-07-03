/**
 * pyodideWorker.js — worker_threads entry for the code-interpreter feature.
 *
 * Lives in a separate worker thread so Pyodide's 200-300MB WASM heap
 * stays isolated from the main Node event loop. The parent process
 * (codeInterpreter.js) manages a pool of these workers.
 *
 * Protocol (parent ↔ worker):
 *   Parent → Worker: { id, type:'run', code, scratchDir, maxOutputBytes,
 *                      interruptBuffer (SharedArrayBuffer) }
 *   Worker → Parent: { id, type:'ready' } once on boot
 *   Worker → Parent: { id, type:'result', status, stdout, stderr,
 *                      exitCode, durationMs, artifacts }
 *
 * The worker calls loadPyodide() on first boot, then installs a custom
 * Python stream class that captures into a buffer and raises past the
 * byte cap. Interrupt: parent writes 0x02 (SIGINT) into the SharedArrayBuffer;
 * Pyodide's periodic poll raises KeyboardInterrupt cooperatively inside
 * the user's Python code, which we translate to status:'timeout'.
 */
import { parentPort } from 'node:worker_threads';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadPyodide } from 'pyodide';

let pyodide = null;
let bootError = null;
let interruptBufferUint8 = null;

/**
 * Boot Pyodide. ~3-5s on a warm cache; the parent warm-pool amortises this.
 */
/* Scientific packages to preload on boot. Pyodide 0.26 with
   `fullStdLib:false` ships only the core interpreter; numpy / pandas /
   matplotlib are available as prebuilt wheels via `loadPackage`. We
   pull them at boot so the first user request doesn't pay the
   ~30 MB download cost. If a load fails (offline, version mismatch),
   the boot still succeeds — the user's code will see a clean
   `ModuleNotFoundError` for the missing package instead of crashing
   the worker. */
const PRELOAD_PACKAGES = ['numpy', 'pandas', 'matplotlib'];

async function bootPyodide() {
  try {
    pyodide = await loadPyodide({
      // Default indexURL auto-detects the pyodide package's own directory
      // in Node — the WASM blob lives next to pyodide.mjs in node_modules.
      fullStdLib: false,
    });

    /* Preload scientific packages. loadPackage is a no-op for already-
       loaded packages, so this is safe to call repeatedly. The wheels
       cache to node_modules on first download — subsequent boots just
       read from disk. */
    for (const pkg of PRELOAD_PACKAGES) {
      try {
        await pyodide.loadPackage([pkg]);
      } catch (e) {
        console.error(`[pyodide] preload ${pkg} failed: ${e && e.message || e}`);
      }
    }

    // Install a self-contained stream class. sys.stdout and sys.stderr are
    // replaced with instances of this class on each run() call. The class
    // keeps its own buffer (no dependency on the original stream's API),
    // enforces a per-run byte cap, and exposes a getvalue() method so we
    // can pull the captured text after the run.
    pyodide.runPython(`
import sys

class _CappedStream:
    """Self-contained byte-capped text stream. No wrapping of any original."""

    def __init__(self, label):
        self._label = label
        self._buf = []
        self._n = 0
        self._max = 0

    def set_limit(self, n):
        self._buf = []
        self._n = 0
        self._max = max(0, int(n))

    def writable(self):
        return True

    def write(self, s):
        if not s:
            return 0
        if not isinstance(s, str):
            s = str(s)
        bs = len(s.encode('utf-8'))
        if self._max > 0 and self._n + bs > self._max:
            # Write what fits, then raise so the run fails loudly.
            room = max(0, self._max - self._n)
            # Approximate — slice to room/4 chars (utf-8 worst case 4 bytes).
            head = s[: max(0, room // 4)]
            self._buf.append(head)
            self._n += len(head.encode('utf-8'))
            raise RuntimeError('output_limit_exceeded: ' + self._label + ' exceeded ' + str(self._max) + ' bytes')
        self._buf.append(s)
        self._n += bs
        return bs

    def flush(self):
        pass

    def getvalue(self):
        return ''.join(self._buf)

    def get_count(self):
        return self._n


_stdout_cap = _CappedStream('stdout')
_stderr_cap = _CappedStream('stderr')
`);

    parentPort.postMessage({ id: 'boot', type: 'ready', version: pyodide.version });
  } catch (err) {
    bootError = err;
    parentPort.postMessage({ id: 'boot', type: 'error', error: String(err && err.message || err) });
  }
}

/**
 * Execute one piece of user-supplied Python inside the warmed Pyodide
 * instance. Returns a structured result.
 */
async function runCode({ id, executionId, code, scratchDir, maxOutputBytes, interruptBuffer, signal }) {
  if (!pyodide) {
    return {
      id, type: 'result',
      status: 'failed',
      errorMessage: bootError ? ('boot_error: ' + String(bootError.message)) : 'pyodide_not_ready',
      stdout: '', stderr: '', exitCode: 1, durationMs: 0, artifacts: [],
    };
  }

  // Reset stream state for this run.
  pyodide.runPython(`_stdout_cap.set_limit(${maxOutputBytes}); _stderr_cap.set_limit(${maxOutputBytes}); sys.stdout = _stdout_cap; sys.stderr = _stderr_cap`);

  // Wire the interrupt buffer (SharedArrayBuffer) — parent writes 0x02 on timeout.
  if (interruptBuffer && interruptBuffer !== interruptBufferUint8?.buffer) {
    interruptBufferUint8 = new Uint8Array(interruptBuffer);
    pyodide.setInterruptBuffer(interruptBufferUint8);
  }

  // Mirror the host artifacts dir into Pyodide's MEMFS at /artifacts so
  // the user's `open('foo.png')` lands in the scratch dir on the host FS.
  const artifactsDir = path.join(scratchDir, 'artifacts');
  await fs.mkdir(artifactsDir, { recursive: true }).catch(() => {});
  try { pyodide.FS.mkdirTree('/artifacts'); } catch (_) {}
  try { pyodide.FS.unmount('/artifacts'); } catch (_) {}
  pyodide.FS.mount(pyodide.FS.filesystems.NODEFS, { root: artifactsDir }, '/artifacts');
  pyodide.runPython(`import os; os.chdir('/artifacts')`);

  const startedAt = Date.now();
  let status = 'completed';
  let exitCode = 0;
  let errorMessage = null;
  let pendingPyType = null;       // for the errorMessage finalized after stderr read
  let pendingCancelled = false;   // true if caller-side AbortSignal fired
  let cancelled = false;
  const onAbort = () => { cancelled = true; };
  if (signal) {
    if (signal.aborted) cancelled = true;
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    // Wrap the user's code in a Python try/except that emits a clean,
    // parseable error marker on stderr. Pyodide's runPythonAsync discards
    // the original Python traceback when the JS boundary catches it
    // (err.message becomes the literal "PythonError"), so we have to
    // extract the human-readable error from Python ourselves.
    //
    // We pass the user's code through compile() so multi-line Python
    // (defs, loops, indented blocks) is parsed as a single unit. This
    // also lets us surface tracebacks cleanly via the wrapped exec.
    //
    // Encoding: we ship the user's code on a SINGLE LINE by replacing
    // physical newlines with `\n` (literal escape). Python's compile()
    // interprets `\n` correctly inside string literals and as line
    // separators elsewhere — single-line source is required because
    // Pyodide's eval_code_async splits on newlines before handing the
    // body to Python's parser, so a multi-line exec body that contains
    // an unterminated string literal on the first line fails to parse.
    const oneLine = code
      .replace(/\\/g, '\\\\')   // backslash → double-backslash
      .replace(/"/g, '\\"')     // double-quote → backslash-quote
      .replace(/\r?\n/g, '\\n');    // physical newline → \n escape
    const wrapped = [
      '_socrates_user_code = "' + oneLine + '"',
      'try:',
      '    _socrates_compiled = compile(_socrates_user_code, "<socrates>", "exec")',
      '    exec(_socrates_compiled, {"__name__": "__main__"})',
      'except SystemExit:',
      '    raise',
      'except BaseException as _socrates_e:',
      '    import sys',
      '    print("---SOCRATES-ERROR-BEGIN---", file=sys.stderr)',
      '    print(type(_socrates_e).__name__ + ": " + str(_socrates_e), file=sys.stderr)',
      '    print("---SOCRATES-ERROR-END---", file=sys.stderr)',
      '    raise',
    ].join('\n');
    await pyodide.runPythonAsync(wrapped);
  } catch (err) {
    const name = err && (err.constructor?.name || '');
    const pyType = (err && err.type) || '';
    const traceback = String(err && err.message || err);
    if (traceback.includes('output_limit_exceeded')) {
      status = 'failed';
      errorMessage = 'output_limit_exceeded';
      exitCode = 1;
    } else if (name === 'KeyboardInterrupt' || traceback.includes('KeyboardInterrupt')) {
      status = 'timeout';
      errorMessage = 'timeout';
    } else if (cancelled) {
      status = 'cancelled';
      errorMessage = 'cancelled_by_caller';
    } else {
      // Defer to finalize step below — we need the stderr capture to extract
      // the human-readable "<Class>: <msg>" line.
      pendingPyType = pyType;
      pendingCancelled = false;
      status = 'failed';
      exitCode = 1;
    }
  } finally {
    if (signal) signal.removeEventListener('abort', onAbort);
    try { pyodide.FS.unmount('/artifacts'); } catch (_) {}
  }

  const durationMs = Date.now() - startedAt;

  // Pull captured stdout/stderr text from the Python shims.
  let stdoutText = '';
  let stderrText = '';
  try {
    stdoutText = pyodide.runPython('_stdout_cap.getvalue()') || '';
    stderrText = pyodide.runPython('_stderr_cap.getvalue()') || '';
  } catch (_) { /* shim may have raised mid-write */ }

  // If we deferred the errorMessage in the catch block above, parse it now
  // from the captured stderr (where the Python wrapper wrote it before
  // re-raising).
  if (errorMessage === null && pendingPyType !== null && status === 'failed') {
    const beginIdx = stderrText.indexOf('---SOCRATES-ERROR-BEGIN---');
    const endIdx = stderrText.indexOf('---SOCRATES-ERROR-END---');
    if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
      const between = stderrText.slice(beginIdx + '---SOCRATES-ERROR-BEGIN---'.length, endIdx).trim();
      errorMessage = between || (pendingPyType ? pendingPyType : 'unknown_python_error');
    } else {
      errorMessage = pendingPyType ? pendingPyType : 'unknown_python_error';
    }
    // Strip the marker lines from what we return so the user doesn't see them.
    const re = /---SOCRATES-ERROR-(BEGIN|END)---\n?/g;
    stderrText = stderrText.replace(re, '').trim();
  }

  // Walk the artifacts dir and report what we produced.
  let artifacts = [];
  try {
    const entries = await fs.readdir(artifactsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const filePath = path.join(artifactsDir, entry.name);
      const stat = await fs.stat(filePath);
      artifacts.push({
        name: entry.name,
        relPath: entry.name,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        absPath: filePath,
      });
    }
  } catch (_) {}

  // Drop interrupt buffer reference so subsequent runs re-wire cleanly.
  if (interruptBufferUint8) {
    pyodide.setInterruptBuffer(undefined);
    interruptBufferUint8 = null;
  }

  return {
    id,
    type: 'result',
    executionId,
    status,
    exitCode,
    durationMs,
    stdout: String(stdoutText),
    stderr: String(stderrText),
    errorMessage,
    artifacts,
  };
}

parentPort.on('message', async (msg) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'run') {
    try {
      const result = await runCode(msg);
      parentPort.postMessage(result);
    } catch (err) {
      parentPort.postMessage({
        id: msg.id,
        type: 'result',
        executionId: msg.executionId,
        status: 'failed',
        exitCode: 1,
        durationMs: 0,
        stdout: '',
        stderr: '',
        errorMessage: 'worker_error: ' + String(err && err.message || err),
        artifacts: [],
      });
    }
  }
});

// Kick off boot. Post 'ready' once loadPyodide resolves.
await bootPyodide();
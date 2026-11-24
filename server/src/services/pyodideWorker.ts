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
import fsSync from 'node:fs';
import path from 'node:path';
import { loadPyodide, type PyodideInterface } from 'pyodide';
import type { TypedArray } from 'pyodide/ffi';
import { sanitizeLogValue } from '../lib/logRedaction.js';
import { ensureCjkFontCached } from './codeInterpreter/cjkFontCache.js';
import { PYODIDE_PACKAGE_CACHE_DIR } from './codeInterpreter/config.js';

let pyodide: PyodideInterface | null = null;
let bootError: Error | null = null;
let interruptBufferUint8: Uint8Array | null = null;

/** Shape of the parent -> worker 'run' message consumed by runCode(). */
interface RunCodeRequest {
  id: string;
  executionId?: string;
  code: string;
  scratchDir: string;
  maxOutputBytes: number;
  interruptBuffer?: SharedArrayBuffer;
  signal?: AbortSignal;
}

/** Dynamic error object shapes surfaced across the Pyodide/JS bridge. */
interface PyRunError extends Error {
  type?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isRunCodeRequest(value: unknown): value is RunCodeRequest {
  return (
    isRecord(value) &&
    value.type === 'run' &&
    typeof value.id === 'string' &&
    typeof value.code === 'string' &&
    typeof value.scratchDir === 'string' &&
    typeof value.maxOutputBytes === 'number' &&
    (value.interruptBuffer === undefined || value.interruptBuffer instanceof SharedArrayBuffer)
  );
}

/* A SyntaxError-family failure means compile() rejected the source before any
 * user code ran, so the parent can persist the row as 'rejected' and keep it
 * out of the daily execution quota. Runtime failures still count. */
function classifyExecutionError(
  status: string,
  errorMessage: string | null,
  dependencyLoadFailed: boolean,
): string | undefined {
  if (status !== 'failed' || !errorMessage) return undefined;
  if (/^(SyntaxError|IndentationError|TabError)\b/.test(errorMessage)) return 'syntax_error';
  if (dependencyLoadFailed && /^ModuleNotFoundError\b/.test(errorMessage)) {
    return 'python_dependency_unavailable';
  }
  return undefined;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

function formatTotalSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
}

/**
 * Boot Pyodide. ~3-5s on a warm cache; the parent warm-pool amortises this.
 */
/* Pyodide's matplotlib ships only DejaVu Sans, which has no CJK glyphs, so
   chart text in Chinese renders as tofu on the first try. The font file is
   fetched, pinned and validated by `./codeInterpreter/cjkFontCache.ts`; the
   server boot sequence warms that cache so the fetch is not on the first
   matplotlib run's critical path. Here we only register the cached file with
   matplotlib's font_manager and put it first in rcParams['font.sans-serif'].
   The model-facing tool description tells the model not to override
   font.sans-serif so it can't undo the fix. If the cache is unavailable we
   log a warning and fall through to DejaVu — charts still work, just with
   tofu for CJK. */
let _cjkFontPromise: Promise<string | null> | null = null;

function _registerCjkFontInPyodide(fontPath: string): string | null {
  if (!pyodide) return null;
  try {
    const bytes = fsSync.readFileSync(fontPath);
    const memfsPath = '/usr/share/fonts/_socrates_cjk.otf';
    try {
      pyodide.FS.mkdirTree('/usr/share/fonts');
    } catch (_) {
      /* empty-catch: intentional — the MEMFS font directory already exists */
    }
    pyodide.FS.writeFile(memfsPath, new Uint8Array(bytes));
    const family = pyodide.runPython(`
import matplotlib
import matplotlib.font_manager as fm
import matplotlib.pyplot as plt
try:
    # Register the .otf with matplotlib's font manager. Pyodide's MEMFS
    # supports the syscalls font_manager uses, so this works for files
    # written under /usr/share/fonts/.
    fm.fontManager.addfont(${JSON.stringify(memfsPath)})
    # Read the canonical family name straight from the font file. The
    # return value of fontManager.addfont() is version-dependent (a list
    # of family-name strings in matplotlib 3.6, a list of FontEntry
    # objects in matplotlib 3.7+, and even a bare empty list in some
    # builds), so trying to recover the name from added[0] was
    # unreliable and caused CJK to silently fall back to DejaVu Sans
    # (= tofu in titles/labels/legends). FontProperties(fname=...) is
    # stable across matplotlib versions.
    from matplotlib.font_manager import FontProperties
    family_name = FontProperties(fname=${JSON.stringify(memfsPath)}).get_name()
    # Some matplotlib builds resolve Noto Sans SC as a different
    # canonical name (e.g. "Noto Sans CJK SC"); fall back to scanning
    # ttflist if the resolver returns an empty string.
    if not family_name or not isinstance(family_name, str):
        candidates = [f.name for f in fm.fontManager.ttflist
                      if 'noto' in f.name.lower() and ('cjk' in f.name.lower() or 'sc' in f.name.lower())]
        family_name = candidates[0] if candidates else ''
    if not family_name:
        print('[pyodide] CJK font registered but family name could not be resolved')
    else:
        # Insert at the FRONT, but preserve whatever else the runtime
        # already had so we don't strip out fonts the user configured
        # earlier in this session (the previous code hard-coded
        # fallback=['DejaVu Sans'], which silently dropped anything else).
        fallback = list(plt.rcParams.get('font.sans-serif', ['DejaVu Sans']))
        if family_name in fallback:
            fallback.remove(family_name)
        plt.rcParams['font.sans-serif'] = [family_name] + fallback
        plt.rcParams['font.family'] = 'sans-serif'
        plt.rcParams['axes.unicode_minus'] = False
        print(f'[pyodide] CJK font active: {family_name}')
    family_name
except Exception as _e:
    print('[pyodide] CJK font registration failed:', repr(_e))
    ''
`);
    if (family && typeof family === 'string') {
      console.log(`[pyodide] Registered CJK font: ${family}`);
      return family;
    }
    return null;
  } catch (err) {
    console.warn(
      `[pyodide] CJK font registration threw: ${(err && (err as Error).message) || err}`,
    );
    return null;
  }
}

function _ensureCjkFontRegistered(): Promise<string | null> {
  _cjkFontPromise ??= (async () => {
    const fontPath = await ensureCjkFontCached();
    if (!fontPath) return null;
    return _registerCjkFontInPyodide(fontPath);
  })().catch((err) => {
    console.warn(`[pyodide] CJK font setup failed: ${(err && (err as Error).message) || err}`);
    return null;
  });
  return _cjkFontPromise;
}

async function bootPyodide() {
  try {
    // Pyodide caches downloaded wheels under packageCacheDir. Its default is
    // the package directory (node_modules), which a production install may
    // expose read-only; pass the writable state directory and fall back when
    // it cannot be created so boot still succeeds.
    let packageCacheDir: string | undefined;
    try {
      await fs.mkdir(PYODIDE_PACKAGE_CACHE_DIR, { recursive: true });
      await fs.access(PYODIDE_PACKAGE_CACHE_DIR, fsSync.constants.W_OK);
      packageCacheDir = PYODIDE_PACKAGE_CACHE_DIR;
    } catch (err) {
      console.warn(
        `[pyodide] package cache unavailable, using the Pyodide default: ${(err && (err as Error).message) || err}`,
      );
    }
    pyodide = await loadPyodide({
      // Default indexURL auto-detects the pyodide package's own directory
      // in Node — the WASM blob lives next to pyodide.mjs in node_modules.
      fullStdLib: false,
      ...(packageCacheDir ? { packageCacheDir } : {}),
      // Use explicit callbacks because Pyodide's default file-descriptor
      // bindings can raise an I/O error in a Node worker. These handle
      // startup diagnostics; runCode() installs capped Python streams.
      stdout: (msg: string) => {
        try {
          console.log(`[pyodide-boot] ${msg}`);
        } catch (_) {
          /* empty-catch: intentional — boot log after the worker was torn down */
        }
      },
      stderr: (msg: string) => {
        try {
          console.warn(`[pyodide-boot] ${msg}`);
        } catch (_) {
          /* empty-catch: intentional — boot log after the worker was torn down */
        }
      },
    });

    // Install a self-contained stream class. sys.stdout and sys.stderr are
    // replaced with instances of this class on each run() call. The class
    // keeps its own buffer (no dependency on the original stream's API),
    // enforces a per-run byte cap, and exposes a getvalue() method so we
    // can pull the captured text after the run.
    //
    // matplotlib declares `matplotlib-pyodide` as a dependency. When user code
    // triggers pyplot's auto-backend logic, the candidate list can
    // include `module://matplotlib_pyodide.wasm_backend`, whose top-
    // level `from js import ImageData, document` raises ImportError
    // under Node (no `js` globals). Set the headless default before the
    // first import without depending on matplotlib to boot the worker.
    pyodide.runPython(String.raw`
import os, sys
os.environ['MPLBACKEND'] = 'Agg'

class _CappedStream:
    """Self-contained byte-capped text stream. No wrapping of any original."""

    def __init__(self, label):
        self._label = label
        self._buf = []
        self._n = 0
        self._max = 0
        self._hook = None
        self._last_flush_idx = 0
        self._pending_bytes = 0

    def set_limit(self, n):
        self._buf = []
        self._n = 0
        self._max = max(0, int(n))
        self._pending_bytes = 0

    def writable(self):
        return True

    def _emit_delta(self):
        """Forward the buffer delta since the last emit to the JS hook."""
        try:
            if self._hook is not None:
                tail = ''.join(self._buf[self._last_flush_idx:])
                if tail:
                    self._hook(tail)
            self._last_flush_idx = len(self._buf)
        except Exception:
            pass
        finally:
            self._pending_bytes = 0

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
        self._pending_bytes += bs
        # print() only calls flush() when flush=True,
        # so a flush-only hook left the "live output" stream silent
        # for the entire run. Emit when a line completes, or when the
        # pending delta grows past ~4 KB (covers unterminated writes
        # and \r progress-bar spam without a per-update SSE storm).
        if '\n' in s or self._pending_bytes >= 4096:
            self._emit_delta()
        return bs

    def flush(self):
        self._emit_delta()

    def set_hook(self, hook):
        self._hook = hook
        self._last_flush_idx = 0
        self._pending_bytes = 0

    def getvalue(self):
        return ''.join(self._buf)

    def get_count(self):
        return self._n


_stdout_cap = _CappedStream('stdout')
_stderr_cap = _CappedStream('stderr')

# JS-installable hook called from Python's flush().
# Default is a noop so the stream class is self-contained. The
# runner sets it from JS via pyodide.globals.set before each run.
def _socrates_no_flush(_stream, _chunk):
    pass
_socrates_on_flush = _socrates_no_flush

def _socrates_install_hooks(stdout_hook, stderr_hook):
    """Install per-stream flush hooks from JS. The hook is a
    2-arg Python callable (stream_label, chunk_text). The runner
    wires this to a JS callback that posts an incremental
    stdout/stderr message back to the parent. Failures inside the
    hook are swallowed so a transport hiccup never crashes Python."""
    import functools
    def _safe(label, hook):
        def _wrapped(chunk):
            try:
                if hook is None: return
                hook(label, chunk)
            except Exception:
                pass
        return _wrapped
    _stdout_cap.set_hook(_safe('stdout', stdout_hook))
    _stderr_cap.set_hook(_safe('stderr', stderr_hook))

# Wire flush() to invoke the hook. We do this AFTER the hook
# machinery is defined so any flush() before install_hooks() runs
# is still safe (the noop default).
def _socrates_make_flush(orig_flush):
    def _wrapped():
        try:
            # The actual chunk is the most recently written slice.
            # We can't recover individual write() calls from the
            # buffer (it's a list of arbitrary strings), so we
            # forward the *delta* since the last flush. The hook
            # is best-effort: the final getvalue() still carries
            # the canonical text.
            pass
        except Exception:
            pass
        return orig_flush()
    return _wrapped
`);

    // Acquiring a worker must not depend on downloading optional wheels or fonts.
    parentPort!.postMessage({ id: 'boot', type: 'ready', version: pyodide.version });
  } catch (err) {
    bootError = err as Error;
    parentPort!.postMessage({
      id: 'boot',
      type: 'error',
      error: String((err && (err as PyRunError).message) || err),
    });
  }
}

/**
 * Execute one piece of user-supplied Python inside the warmed Pyodide
 * instance. Returns a structured result.
 */
/* Cognitive complexity: runCode is the worker's transaction — every block is
 * one ordered phase (hooks, MEMFS mount, package load, execute, classify,
 * capture) and the branches are error paths that must stay next to the phase
 * that owns them. Extracting the phases would thread the same mutable result
 * through helpers without simplifying any single decision. */
/* NOSONAR */ async function runCode({
  id,
  executionId,
  code,
  scratchDir,
  maxOutputBytes,
  interruptBuffer,
  signal,
}: RunCodeRequest) {
  const startedAt = Date.now();
  if (!pyodide) {
    return {
      id,
      type: 'result',
      status: 'failed',
      errorMessage: bootError ? 'boot_error: ' + String(bootError.message) : 'pyodide_not_ready',
      stdout: '',
      stderr: '',
      exitCode: 1,
      durationMs: Math.max(1, Date.now() - startedAt),
      artifacts: [],
    };
  }

  pyodide.runPython(
    `_stdout_cap.set_limit(${maxOutputBytes}); _stderr_cap.set_limit(${maxOutputBytes}); sys.stdout = _stdout_cap; sys.stderr = _stderr_cap`,
  );

  /* install the delta hooks so the parent receives
     incremental stdout/stderr. The stream emits on line boundaries
     from write() (see ) as well as on explicit flush(),
     because print() only flushes when flush=True. The hook is
     best-effort: a thrown transport just no-ops, the canonical
     stdout/stderr in the final `result` is the source of truth. */
  const makeHook = (stream: string) => (_label: unknown, chunk: unknown) => {
    try {
      parentPort!.postMessage({
        id,
        type: stream,
        stream,
        chunk: typeof chunk === 'string' ? chunk : '',
        executionId,
        elapsedMs: Date.now() - startedAt,
      });
    } catch (_) {
      /* empty-catch: intentional — parent port closed; the final result still carries stdout/stderr */
    }
  };
  pyodide.globals.set('_socrates_out_hook_js', makeHook('stdout'));
  pyodide.globals.set('_socrates_err_hook_js', makeHook('stderr'));
  pyodide.runPython(`_socrates_install_hooks(_socrates_out_hook_js, _socrates_err_hook_js)`);

  // Wire the interrupt buffer (SharedArrayBuffer) — parent writes 0x02 on timeout.
  if (interruptBuffer && interruptBuffer !== interruptBufferUint8?.buffer) {
    interruptBufferUint8 = new Uint8Array(interruptBuffer);
    pyodide.setInterruptBuffer(interruptBufferUint8);
  }

  // Mirror the host artifacts dir into Pyodide's MEMFS at /artifacts so
  // the user's `open('foo.png')` lands in the scratch dir on the host FS.
  const artifactsDir = path.join(scratchDir, 'artifacts');
  await fs.mkdir(artifactsDir, { recursive: true }).catch(() => {});
  try {
    pyodide.FS.mkdirTree('/artifacts');
  } catch (err) {
    /* empty-catch: intentional — the MEMFS mount point already exists */
  }
  try {
    pyodide.FS.unmount('/artifacts');
  } catch (err) {
    /* empty-catch: intentional — nothing mounted yet on a fresh runtime */
  }
  pyodide.FS.mount(pyodide.FS.filesystems.NODEFS, { root: artifactsDir }, '/artifacts');
  pyodide.runPython(`import os; os.chdir('/artifacts')`);

  /* print the current contents of the
     scratch dir on stdout so the model knows what files already
     exist from earlier runs in this conversation. The new format
     () sorts by mtime desc and shows size + age
     so the model can pick "the latest plot" reliably instead of
     guessing among same-named artifacts. Cap at 20 entries; if
     more, report the count of remaining. */
  try {
    const existing = await fs.readdir(artifactsDir).catch(() => []);
    if (existing.length > 0) {
      const stats = await Promise.all(
        existing.map(async (n) => {
          try {
            const s = await fs.stat(path.join(artifactsDir, n));
            return { name: n, size: s.size, mtimeMs: s.mtimeMs, isFile: s.isFile() };
          } catch (_) {
            /* empty-catch: intentional — a file that vanished between readdir and stat is listed as a zero-byte entry */
            return { name: n, size: 0, mtimeMs: 0, isFile: true };
          }
        }),
      );
      const files = stats.filter((e) => e.isFile).sort((a, b) => b.mtimeMs - a.mtimeMs);
      const head = files.slice(0, 20);
      const more = files.length > 20 ? String.raw`\n  …(+${files.length - 20} more)` : '';
      const totalBytes = files.reduce((s, f) => s + f.size, 0);
      const nowMs = Date.now();
      const lines = head
        .map((f) => {
          const ageS = Math.max(0, Math.round((nowMs - f.mtimeMs) / 1000));
          const sizeKB = formatFileSize(f.size);
          const ageLabel = formatAge(ageS);
          return `  ${f.name}  (${sizeKB}, ${ageLabel})`;
        })
        .join(String.raw`\n`);
      const totalKB = formatTotalSize(totalBytes);
      pyodide.runPython(
        String.raw`print("[scratch] cwd=/artifacts — ${files.length} file${files.length === 1 ? '' : 's'}, ${totalKB} total, newest first:\n${lines}${more}", flush=True)`,
      );
    } else {
      pyodide.runPython(
        `print("[scratch] cwd=/artifacts is empty. Files you write here persist across every code call in this conversation.", flush=True)`,
      );
    }
  } catch (_) {
    /* empty-catch: intentional — the scratch listing is diagnostic; a print failure must not fail the run */
  }

  /* scan the user's imports and install
     every matching package from the Pyodide distribution (scipy,
     sympy, scikit-learn, statsmodels, networkx, pillow…). This is the
     same mechanism JupyterLite and the Pyodide console use; without
     it `import scipy` dies as ModuleNotFoundError even though a
     prebuilt wheel ships with the runtime, and the model then burns
     its retry budget on a failure that was never real. Runs BEFORE
     exec so the import inside user code resolves on first use.
     PyPI-only wheels still need micropip (async — the tool
     description documents the asyncio.run pattern). A syntax error
     in the source makes find_imports raise here — swallowed on
     purpose so the exec below can report the real error through the
     normal marker path. */
  const packagesStartedAt = Date.now();
  let dependencyLoadFailed = false;
  parentPort!.postMessage({
    id,
    type: 'phase',
    phase: 'preparing',
    elapsedMs: packagesStartedAt - startedAt,
  });
  try {
    const loadedPackages = await pyodide.loadPackagesFromImports(code, {
      errorCallback: (message) => {
        dependencyLoadFailed = true;
        console.warn(`[pyodide] dependency load: ${sanitizeLogValue(message, 160)}`);
      },
      messageCallback: (msg: string) => {
        try {
          parentPort!.postMessage({
            id,
            type: 'stdout',
            stream: 'stdout',
            chunk: `[pyodide] ${msg}\n`,
            executionId,
            elapsedMs: Date.now() - startedAt,
          });
        } catch (_) {
          /* empty-catch: intentional — parent port closed during package auto-install */
        }
      },
    });
    const loadedNames = loadedPackages.map((pkg) => pkg.name);
    if (loadedNames.length) {
      const note = `[pyodide] auto-installed: ${loadedNames.join(', ')}`;
      pyodide.runPython(`print(${JSON.stringify(note)}, flush=True)`);
    }
  } catch (_) {
    /* empty-catch: intentional — offline auto-install probe; exec reports the real import error */
  }

  const dependencyMs = Date.now() - packagesStartedAt;
  let fontMs = 0;
  if (Object.hasOwn(pyodide.loadedPackages, 'matplotlib')) {
    const fontStartedAt = Date.now();
    await _ensureCjkFontRegistered();
    fontMs = Date.now() - fontStartedAt;
  }

  const packageMs = dependencyMs + fontMs;
  parentPort!.postMessage({
    id,
    type: 'phase',
    phase: 'running',
    elapsedMs: Date.now() - startedAt,
    packageMs,
    dependencyMs,
    fontMs,
  });

  let status = 'completed';
  let exitCode = 0;
  let errorMessage: string | null = null;
  let pendingPyType: string | null = null; // for the errorMessage finalized after stderr read
  let cancelled = false;
  const onAbort = () => {
    cancelled = true;
  };
  if (signal) {
    if (signal.aborted) cancelled = true;
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    // Wrap the user's code in a Python try/except that emits a clean,
    // parseable error marker on stderr. Pyodide's runPythonAsync
    // discards the original Python traceback when the JS boundary
    // catches it (err.message becomes the literal "PythonError"), so
    // we have to extract the human-readable error from Python
    // ourselves.
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
    //
    // Keep user failures and SystemExit inside Python. Propagating
    // SystemExit through Pyodide can terminate the worker rather than
    // reject runPythonAsync. Flags below carry the outcome to JS.
    //
    // a bare `Type: msg` line told the model
    // WHAT failed but not WHERE, so a fix attempt had to guess which
    // line broke and re-emitted near-identical code. The wrapper now
    // also prints a compact traceback (last 3 frames in the user's
    // `<socrates>` source, each with its source line) to stderr
    // BEFORE the markers: the marker block stays a clean
    // `Type: msg` errorMessage while stderr reads like a real
    // Python traceback — the channel the model already reads and the
    // row's stderr section already renders. For SyntaxError /
    // IndentationError there is no user frame (the failure is inside
    // compile() itself), so `e.lineno` / `e.text` / `e.offset` carry
    // the position. Registering `_socrates_user_code` in
    // `linecache.cache` is the same trick IPython uses for exec'd
    // cells — it is what lets FrameSummary.line resolve to the
    // actual source text instead of None.
    //
    // `except KeyboardInterrupt: raise` must stay ahead of
    // `BaseException`: Pyodide's interrupt buffer raises
    // KeyboardInterrupt inside the user's exec on timeout/cancel,
    // and swallowing it into the marker path reported the run as
    // `failed`/`KeyboardInterrupt` instead of `timeout` — which the
    // executor then marked retryable. Letting it escape keeps the
    // JS-side timeout classification (and the parent's
    // user-raised-KeyboardInterrupt guard) intact.
    const BACKSLASH = String.fromCharCode(0x5c);
    const oneLine = code
      .replaceAll(BACKSLASH, BACKSLASH + BACKSLASH) // backslash → double-backslash
      .replaceAll('"', BACKSLASH + '"') // double-quote → backslash-quote
      .replace(/\r?\n/g, BACKSLASH + 'n'); // physical newline → \n escape
    const wrapped = [
      '_socrates_user_code = "' + oneLine + '"',
      '_socrates_user_failed = False',
      '_socrates_exit_code = None',
      'try:',
      '    _socrates_compiled = compile(_socrates_user_code, "<socrates>", "exec")',
      '    exec(_socrates_compiled, {"__name__": "__main__"})',
      'except SystemExit as _socrates_se:',
      '    _socrates_exit_code = _socrates_se.code',
      '    if _socrates_exit_code is None:',
      '        _socrates_exit_code = 0',
      '    elif not isinstance(_socrates_exit_code, int):',
      '        import sys',
      '        print(str(_socrates_exit_code), file=sys.stderr)',
      '        _socrates_exit_code = 1',
      '    else:',
      '        _socrates_exit_code = int(_socrates_exit_code)',
      'except KeyboardInterrupt:',
      '    raise',
      'except BaseException as _socrates_e:',
      '    import sys, traceback, linecache',
      '    linecache.cache["<socrates>"] = (len(_socrates_user_code), None, _socrates_user_code.splitlines(True), "<socrates>")',
      '    _socrates_frames = [f for f in (traceback.extract_tb(_socrates_e.__traceback__) if _socrates_e.__traceback__ is not None else []) if f.filename == "<socrates>"]',
      '    if (not _socrates_frames) and isinstance(_socrates_e, SyntaxError) and getattr(_socrates_e, "lineno", None):',
      '        print("Traceback (most recent call last):", file=sys.stderr)',
      "        print('  File \"<socrates>\", line ' + str(_socrates_e.lineno) + ', in <module>', file=sys.stderr)",
      '        _socrates_src = (_socrates_e.text or "").strip()',
      '        if not _socrates_src:',
      '            _socrates_lines = _socrates_user_code.splitlines()',
      '            if _socrates_e.lineno <= len(_socrates_lines):',
      '                _socrates_src = _socrates_lines[_socrates_e.lineno - 1].strip()',
      '        if _socrates_src:',
      '            print("    " + _socrates_src, file=sys.stderr)',
      '            _socrates_off = getattr(_socrates_e, "offset", None)',
      '            if _socrates_off:',
      '                print("    " + " " * max(0, _socrates_off - 1) + "^", file=sys.stderr)',
      '    elif _socrates_frames:',
      '        print("Traceback (most recent call last):", file=sys.stderr)',
      '        for _f in _socrates_frames[-3:]:',
      '            _loc = \'  File "<socrates>", line \' + str(_f.lineno)',
      '            if _f.name and _f.name != "<module>":',
      '                _loc += ", in " + _f.name',
      '            print(_loc, file=sys.stderr)',
      '            if _f.line:',
      '                print("    " + _f.line.strip(), file=sys.stderr)',
      '    print("---SOCRATES-ERROR-BEGIN---", file=sys.stderr)',
      '    print(type(_socrates_e).__name__ + ": " + str(_socrates_e), file=sys.stderr)',
      '    print("---SOCRATES-ERROR-END---", file=sys.stderr)',
      '    _socrates_user_failed = True',
    ].join('\n');
    let pyodideThrew = false;
    let interrupted = false;
    try {
      await pyodide.runPythonAsync(wrapped);
    } catch (err) {
      // SystemExit is handled inside Python; only interrupts or an
      // unexpected bridge/runtime error should escape the wrapper.
      pyodideThrew = true;
      const pyErr = err as PyRunError | undefined;
      const errType = pyErr?.type || pyErr?.constructor?.name || '';
      const errMsg = pyErr?.message ?? (typeof err === 'string' ? err : '');
      if (errType === 'KeyboardInterrupt' || /KeyboardInterrupt/.test(errMsg)) {
        /* The wrapper deliberately re-raises KeyboardInterrupt so a
           SIGINT-buffer interrupt (parent timeout or caller cancel)
           reports as `timeout` instead of a generic user failure.
           The parent's `!timedOut` check still maps a user-raised
           KeyboardInterrupt to 'worker_interrupt'. */
        interrupted = true;
      }
    }
    // if the wrapper hit a user-code
    // error, the JS-side status/errorMessage haven't been set yet.
    // Finalise them now from the marker that was just printed.
    const userFailed = (() => {
      try {
        return pyodide.runPython('_socrates_user_failed');
      } catch (_) {
        return true;
      }
    })();
    const sysExitCode = pyodide.runPython('_socrates_exit_code') ?? null;
    if (userFailed) {
      status = 'failed';
      exitCode = 1;
      pendingPyType = 'PythonError';
    } else if (interrupted) {
      /* SIGINT-buffer interrupt (parent timeout / caller abort). The
         parent still discriminates: a user-raised KeyboardInterrupt
         with no timedOut flag becomes 'worker_interrupt'. */
      status = 'timeout';
      errorMessage = 'timeout';
      exitCode = 124;
    } else if (sysExitCode !== null && sysExitCode !== 0) {
      // User called sys.exit(N). Treat as completed only when N is zero.
      status = 'failed';
      exitCode = typeof sysExitCode === 'number' ? sysExitCode : 1;
      errorMessage = `sys.exit(${sysExitCode})`;
    } else if (pyodideThrew) {
      status = 'failed';
      exitCode = 1;
      errorMessage = 'pyodide_internal_error: code_interpreter worker failed; see server logs';
    }
  } catch (err) {
    const name = err && ((err as PyRunError).constructor?.name || '');
    const pyType: string = (err as PyRunError | undefined)?.type || '';
    const traceback = String((err && (err as PyRunError).message) || err);
    if (traceback.includes('output_limit_exceeded')) {
      status = 'failed';
      errorMessage = 'output_limit_exceeded';
      exitCode = 1;
    } else if (cancelled) {
      status = 'cancelled';
      errorMessage = 'cancelled_by_caller';
    } else if (name === 'KeyboardInterrupt' || traceback.includes('KeyboardInterrupt')) {
      status = 'timeout';
      errorMessage = 'timeout';
    } else {
      // Defer to finalize step below — we need the stderr capture to extract
      // the human-readable "<Class>: <msg>" line.
      pendingPyType = pyType;
      status = 'failed';
      exitCode = 1;
    }
  } finally {
    if (signal) signal.removeEventListener('abort', onAbort);
    try {
      pyodide.FS.unmount('/artifacts');
    } catch (_) {
      /* empty-catch: intentional — unmount is best-effort while tearing the run down */
    }
  }

  const durationMs = Date.now() - startedAt;

  // Pull captured stdout/stderr text from the Python shims.
  let stdoutText = '';
  let stderrText = '';
  try {
    stdoutText = pyodide.runPython('_stdout_cap.getvalue()') || '';
    stderrText = pyodide.runPython('_stderr_cap.getvalue()') || '';
  } catch (_) {
    /* empty-catch: intentional — the stream shim may have raised mid-write; the run already reports its failure */
  }

  // If we deferred the errorMessage in the catch block above, parse it now
  // from the captured stderr (where the Python wrapper wrote it before
  // re-raising).
  if (errorMessage === null && pendingPyType !== null && status === 'failed') {
    const beginIdx = stderrText.indexOf('---SOCRATES-ERROR-BEGIN---');
    const endIdx = stderrText.indexOf('---SOCRATES-ERROR-END---');
    if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
      const between = stderrText
        .slice(beginIdx + '---SOCRATES-ERROR-BEGIN---'.length, endIdx)
        .trim();
      errorMessage = between || pendingPyType || 'unknown_python_error';
    } else {
      errorMessage = pendingPyType || 'unknown_python_error';
    }
    // Strip the marker lines from what we return so the user doesn't see them.
    const re = /---SOCRATES-ERROR-(BEGIN|END)---\n?/g;
    stderrText = stderrText.replace(re, '').trim();
  }

  /* a SyntaxError-family failure means compile()
     rejected the source before any user code ran, so the run consumed
     ~zero interpreter time. Tag it so the parent can persist the row
     as 'rejected' and keep it out of the daily execution quota.
     Runtime failures (NameError, TypeError…) still count — they
     burned real worker work. */
  const errorCode = classifyExecutionError(status, errorMessage, dependencyLoadFailed);

  // Walk the artifacts dir and report what we produced.
  let artifacts: Array<{
    name: string;
    relPath: string;
    size: number;
    mtimeMs: number;
    absPath: string;
  }> = [];
  try {
    const entries = await fs.readdir(artifactsDir, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile());
    const found = await Promise.all(
      files.map(async (entry) => {
        try {
          const filePath = path.join(artifactsDir, entry.name);
          const stat = await fs.stat(filePath);
          return [
            {
              name: entry.name,
              relPath: entry.name,
              size: stat.size,
              mtimeMs: stat.mtimeMs,
              absPath: filePath,
            },
          ];
        } catch (_) {
          /* empty-catch: intentional — a file that vanished between readdir and stat is skipped */
          return [];
        }
      }),
    );
    artifacts = found.flat();
  } catch (_) {
    /* empty-catch: intentional — the artifacts dir is absent when the run failed before mounting */
  }

  // Drop interrupt buffer reference so subsequent runs re-wire cleanly.
  if (interruptBufferUint8) {
    pyodide.setInterruptBuffer(undefined as unknown as TypedArray);
    interruptBufferUint8 = null;
  }

  return {
    id,
    type: 'result',
    executionId,
    status,
    exitCode,
    durationMs,
    packageMs,
    stdout: String(stdoutText),
    stderr: String(stderrText),
    errorMessage,
    errorCode,
    artifacts,
  };
}

parentPort!.on('message', async (value: unknown) => {
  if (!isRunCodeRequest(value)) return;
  const msg = value;
  try {
    const result = await runCode(msg);
    parentPort!.postMessage(result);
  } catch (err) {
    parentPort!.postMessage({
      id: msg.id,
      type: 'result',
      executionId: msg.executionId,
      status: 'failed',
      exitCode: 1,
      durationMs: 1,
      stdout: '',
      stderr: '',
      errorMessage: 'worker_error: ' + String((err && (err as PyRunError).message) || err),
      artifacts: [],
    });
  }
});

// Kick off boot. Post 'ready' once loadPyodide resolves.
await bootPyodide();

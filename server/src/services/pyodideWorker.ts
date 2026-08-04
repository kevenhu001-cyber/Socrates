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
import { loadPyodide, type PyodideInterface, type TypedArray } from 'pyodide';

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
  code?: any;
  args?: any;
}

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

/* P_matplotlib-cjk-font — Pyodide's matplotlib ships only DejaVu Sans,
   which has no CJK glyphs, so chart text in Chinese renders as tofu
   on the first try. Download a CJK font on first boot, cache it,
   register it with font_manager, and put it first in
   rcParams['font.sans-serif']. The model-facing tool description
   tells the model not to override font.sans-serif so it can't undo
   the fix. If the download fails we log a warning and fall through to
   DejaVu — charts still work, just with tofu for CJK.

   P_cjk-font-path — the notofonts/noto-cjk repo organizes Simplified
   Chinese under `SC/`, not `CN/`. The previous `/CN/` URL 404'd
   silently and burned the 8s download timeout on every worker boot,
   which then ate into the first call's 30s user-code budget and
   surfaced as a spurious "代码执行超时" error. */
const CJK_FONT_HOST_DIR = process.env.EXEC_CJK_FONT_DIR
  || path.join(process.env.NODE_ENV === 'production' ? '/var/lib/socrates' : require('node:os').tmpdir(), 'socrates-cjk-fonts');
const CJK_FONT_FILENAME = 'NotoSansSC-Regular.otf';
const CJK_FONT_URL = process.env.EXEC_CJK_FONT_URL
  || 'https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf';
const CJK_FONT_BOOT_TIMEOUT_MS = parseInt(process.env.EXEC_CJK_FONT_TIMEOUT_MS || '8000', 10);
let _cjkFontPromise: Promise<string | null> | null = null;
let _cjkFontRegistered = false;

function _cjkFontPath(): string {
  return path.join(CJK_FONT_HOST_DIR, CJK_FONT_FILENAME);
}

async function _downloadCjkFontOnce(): Promise<string | null> {
  const target = _cjkFontPath();
  try {
    const st = await fs.stat(target);
    if (st.isFile() && st.size > 100000) return target;
  } catch (_) { /* not cached yet */ }
  try {
    await fs.mkdir(CJK_FONT_HOST_DIR, { recursive: true });
  } catch (_) { /* race with another boot */ }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CJK_FONT_BOOT_TIMEOUT_MS);
  try {
    const resp = await fetch(CJK_FONT_URL, { signal: controller.signal });
    if (!resp.ok) {
      console.warn(`[pyodide] CJK font download returned HTTP ${resp.status} from ${CJK_FONT_URL}`);
      return null;
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length < 100000) {
      console.warn(`[pyodide] CJK font download too small (${buf.length} bytes); skipping`);
      return null;
    }
    await fs.writeFile(target, buf);
    console.log(`[pyodide] Cached CJK font (${(buf.length / 1024 / 1024).toFixed(1)} MB) at ${target}`);
    return target;
  } catch (err) {
    console.warn(`[pyodide] CJK font download failed: ${err && (err as Error).message || err}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function _registerCjkFontInPyodide(fontPath: string): string | null {
  if (!pyodide) return null;
  try {
    const bytes = fsSync.readFileSync(fontPath);
    const memfsPath = '/usr/share/fonts/_socrates_cjk.otf';
    try { pyodide.FS.mkdirTree('/usr/share/fonts'); } catch (_) { /* dir exists */ }
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
    console.warn(`[pyodide] CJK font registration threw: ${err && (err as Error).message || err}`);
    return null;
  }
}

function _ensureCjkFontRegistered(): Promise<string | null> {
  if (!_cjkFontPromise) {
    _cjkFontPromise = (async () => {
      const fontPath = await _downloadCjkFontOnce();
      if (!fontPath) return null;
      return _registerCjkFontInPyodide(fontPath);
    })().catch((err) => {
      console.warn(`[pyodide] CJK font setup failed: ${err && (err as Error).message || err}`);
      return null;
    });
  }
  return _cjkFontPromise;
}

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
        console.error(`[pyodide] preload ${pkg} failed: ${e && (e as PyRunError).message || e}`);
      }
    }

    // Install a self-contained stream class. sys.stdout and sys.stderr are
    // replaced with instances of this class on each run() call. The class
    // keeps its own buffer (no dependency on the original stream's API),
    // enforces a per-run byte cap, and exposes a getvalue() method so we
    // can pull the captured text after the run.
    //
    // P_matplotlib-backend — matplotlib is preloaded at boot and
    // declares `matplotlib-pyodide` as a dependency. When user code
    // triggers pyplot's auto-backend logic, the candidate list can
    // include `module://matplotlib_pyodide.wasm_backend`, whose top-
    // level `from js import ImageData, document` raises ImportError
    // under Node (no `js` globals). We pin the non-GUI 'Agg' backend
    // before any user code runs so the wasm_backend is never tried.
    pyodide.runPython(`
import sys
try:
    import matplotlib
    matplotlib.use('Agg')
except Exception:
    pass

class _CappedStream:
    """Self-contained byte-capped text stream. No wrapping of any original."""

    def __init__(self, label):
        self._label = label
        self._buf = []
        self._n = 0
        self._max = 0
        self._hook = None
        self._last_flush_idx = 0

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
        try:
            if self._hook is not None:
                # Flush the delta since the last flush.
                tail = ''.join(self._buf[self._last_flush_idx:])
                if tail:
                    self._hook(tail)
                self._last_flush_idx = len(self._buf)
        except Exception:
            pass

    def set_hook(self, hook):
        self._hook = hook
        self._last_flush_idx = 0

    def getvalue(self):
        return ''.join(self._buf)

    def get_count(self):
        return self._n


_stdout_cap = _CappedStream('stdout')
_stderr_cap = _CappedStream('stderr')

# P_progress — JS-installable hook called from Python's flush().
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

    // Register the optional font before advertising readiness. This keeps
    // font/network work outside the per-execution timeout budget. Failure is
    // intentionally non-fatal: matplotlib can continue with its default font.
    const family = await _ensureCjkFontRegistered();
    if (family) _cjkFontRegistered = true;

    parentPort!.postMessage({ id: 'boot', type: 'ready', version: pyodide.version });
  } catch (err) {
    bootError = err as Error;
    parentPort!.postMessage({ id: 'boot', type: 'error', error: String(err && (err as PyRunError).message || err) });
  }
}

/**
 * Execute one piece of user-supplied Python inside the warmed Pyodide
 * instance. Returns a structured result.
 */
async function runCode({ id, executionId, code, scratchDir, maxOutputBytes, interruptBuffer, signal }: RunCodeRequest) {
  const startedAt = Date.now();
  if (!pyodide) {
    return {
      id, type: 'result',
      status: 'failed',
      errorMessage: bootError ? ('boot_error: ' + String(bootError.message)) : 'pyodide_not_ready',
      stdout: '', stderr: '', exitCode: 1, durationMs: Math.max(1, Date.now() - startedAt), artifacts: [],
    };
  }

  pyodide.runPython(`_stdout_cap.set_limit(${maxOutputBytes}); _stderr_cap.set_limit(${maxOutputBytes}); sys.stdout = _stdout_cap; sys.stderr = _stderr_cap`);

  /* P_progress — install the flush hooks so the parent receives
     incremental stdout/stderr. The hooks run on Python's flush(),
     which print() calls after every newline by default. The hook
     is best-effort: a thrown transport just no-ops, the canonical
     stdout/stderr in the final `result` is the source of truth. */
  const makeHook = (stream: string) => (chunk: unknown) => {
    try {
      parentPort!.postMessage({
        id, type: stream, stream, chunk: String(chunk || ''),
        executionId, elapsedMs: Date.now() - startedAt,
      });
    } catch (_) { /* parent closed */ }
  };
  (pyodide.globals as any).set('_socrates_out_hook_js', makeHook('stdout'));
  (pyodide.globals as any).set('_socrates_err_hook_js', makeHook('stderr'));
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
  try { pyodide.FS.mkdirTree('/artifacts'); } catch (err) { /* directory already exists */ }
  try { pyodide.FS.unmount('/artifacts'); } catch (err) { /* not mounted yet */ }
  pyodide.FS.mount(pyodide.FS.filesystems.NODEFS, { root: artifactsDir }, '/artifacts');
  pyodide.runPython(`import os; os.chdir('/artifacts')`);

  /* P_session-scoped-scratch — print the current contents of the
     scratch dir on stdout so the model knows what files already
     exist from earlier runs in this conversation. The new format
     (P_scratch-enriched) sorts by mtime desc and shows size + age
     so the model can pick "the latest plot" reliably instead of
     guessing among same-named artifacts. Cap at 20 entries; if
     more, report the count of remaining. */
  try {
    const existing = await fs.readdir(artifactsDir).catch(() => []);
    if (existing.length > 0) {
      const stats = await Promise.all(existing.map(async (n) => {
        try {
          const s = await fs.stat(path.join(artifactsDir, n));
          return { name: n, size: s.size, mtimeMs: s.mtimeMs, isFile: s.isFile() };
        } catch (_) { return { name: n, size: 0, mtimeMs: 0, isFile: true }; }
      }));
      const files = stats
        .filter(e => e.isFile)
        .sort((a, b) => b.mtimeMs - a.mtimeMs);
      const head = files.slice(0, 20);
      const more = files.length > 20 ? `\\n  …(+${files.length - 20} more)` : '';
      const totalBytes = files.reduce((s, f) => s + f.size, 0);
      const nowMs = Date.now();
      const lines = head.map(f => {
        const ageS = Math.max(0, Math.round((nowMs - f.mtimeMs) / 1000));
        const sizeKB = f.size < 1024 ? `${f.size}B` : f.size < 1024 * 1024
          ? `${(f.size / 1024).toFixed(1)}KB`
          : `${(f.size / 1024 / 1024).toFixed(2)}MB`;
        const ageLabel = ageS < 60 ? `${ageS}s ago` : ageS < 3600
          ? `${Math.round(ageS / 60)}m ago`
          : `${Math.round(ageS / 3600)}h ago`;
        return `  ${f.name}  (${sizeKB}, ${ageLabel})`;
      }).join('\\n');
      const totalKB = totalBytes < 1024 * 1024
        ? `${(totalBytes / 1024).toFixed(1)}KB`
        : `${(totalBytes / 1024 / 1024).toFixed(2)}MB`;
      pyodide.runPython(
        `print("[scratch] cwd=/artifacts — ${files.length} file${files.length === 1 ? '' : 's'}, ${totalKB} total, newest first:\\n${lines}${more}", flush=True)`
      );
    } else {
      pyodide.runPython(
        `print("[scratch] cwd=/artifacts is empty. Files you write here persist across every code call in this conversation.", flush=True)`
      );
    }
  } catch (_) { /* non-fatal */ }

  let status = 'completed';
  let exitCode = 0;
  let errorMessage: string | null = null;
  let pendingPyType: string | null = null;       // for the errorMessage finalized after stderr read
  let pendingCancelled = false;   // true if caller-side AbortSignal fired
  let cancelled = false;
  const onAbort = () => { cancelled = true; };
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
    // P_no-top-level-await — the wrapper previously `raise`d after
    // printing the error marker. That re-raise made Python's default
    // unhandled-exception handler ALSO print a multi-line traceback
    // (frame names, file `<socrates>`, line numbers) to stderr,
    // showing the user the raw internals. We now exit the wrapper
    // cleanly via sys.exit(1) — the marker is the only diagnostic
    // they see, and the JS side reads it via the deferred-error
    // path below. The `_socrates_user_failed` flag lets the JS catch
    // distinguish "user code raised" from "Pyodide itself blew up".
    const oneLine = code
      .replace(/\\/g, '\\\\')   // backslash → double-backslash
      .replace(/"/g, '\\"')     // double-quote → backslash-quote
      .replace(/\r?\n/g, '\\n');    // physical newline → \n escape
    const wrapped = [
      '_socrates_user_code = "' + oneLine + '"',
      '_socrates_user_failed = False',
      'try:',
      '    _socrates_compiled = compile(_socrates_user_code, "<socrates>", "exec")',
      '    exec(_socrates_compiled, {"__name__": "__main__"})',
      'except SystemExit as _socrates_se:',
      '    raise',
      'except BaseException as _socrates_e:',
      '    import sys',
      '    print("---SOCRATES-ERROR-BEGIN---", file=sys.stderr)',
      '    print(type(_socrates_e).__name__ + ": " + str(_socrates_e), file=sys.stderr)',
      '    print("---SOCRATES-ERROR-END---", file=sys.stderr)',
      '    _socrates_user_failed = True',
      '    sys.exit(1)',
    ].join('\n');
    let pyodideThrew = false;
    let sysExitCode: number | null = null;
    try {
      await pyodide.runPythonAsync(wrapped);
    } catch (err) {
      // P_pyodide-throw-classify — `runPythonAsync` re-raises the
      // Python exception across the JS bridge. The user-side
      // traceback frames (file `<exec>`, etc.) leak into
      // err.message. We ignore that here and rely on the stderr
      // marker for the friendly message. Distinguish three cases:
      //   - User code called sys.exit(N)            → re-raised SystemExit
      //   - User code raised any other BaseException → re-raised as a PythonError
      //   - Pyodide itself blew up                  → some other JS error
      // We use the err.type / err.name / err.code to tell them apart.
      pyodideThrew = true;
      const errType = String(err && ((err as PyRunError).type || (err as PyRunError).constructor?.name) || '');
      const errMsg = String(err && (err as PyRunError).message || err);
      if (errType === 'SystemExit' || /SystemExit/.test(errMsg)) {
        // A clean sys.exit from user code. The exit code is on
        // err.args / err.code in Pyodide 0.26. Pull it if we can;
        // otherwise default to 0 (Python's sys.exit() with no arg).
        const code = (err && ((err as PyRunError).code != null ? (err as PyRunError).code : (Array.isArray((err as PyRunError).args) ? (err as PyRunError).args[0] : null))) ?? 0;
        sysExitCode = typeof code === 'number' ? code : (code == null ? 0 : 1);
      }
      void err;
    }
    // P_user-failed-finalise — if the wrapper hit a user-code
    // error, the JS-side status/errorMessage haven't been set yet.
    // Finalise them now from the marker that was just printed.
    if (pyodideThrew) {
      const userFailed = (() => {
        try { return pyodide.runPython('_socrates_user_failed'); } catch (_) { return true; }
      })();
      if (userFailed) {
        status = 'failed';
        exitCode = 1;
        pendingPyType = 'PythonError';
      } else if (sysExitCode !== null) {
        // User called sys.exit(N). Treat as completed unless the
        // code is non-zero. Pyodide's `runPythonAsync` propagates
        // SystemExit as a JS exception regardless of the exit code;
        // we discriminate here so a clean sys.exit(0) doesn't
        // surface as a worker crash.
        if (sysExitCode === 0) {
          status = 'completed';
          exitCode = 0;
        } else {
          status = 'failed';
          exitCode = typeof sysExitCode === 'number' ? sysExitCode : 1;
          errorMessage = `sys.exit(${sysExitCode})`;
        }
      } else {
        // Pyodide-level failure (worker died, OOM, etc.) — surface
        // the raw JS error so the operator can diagnose.
        status = 'failed';
        exitCode = 1;
        errorMessage = 'pyodide_internal_error: code_interpreter worker failed; see server logs';
      }
    }
  } catch (err) {
    const name = err && ((err as PyRunError).constructor?.name || '');
    const pyType: string = ((err as PyRunError | undefined)?.type) || '';
    const traceback = String(err && (err as PyRunError).message || err);
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
  let artifacts: Array<{ name: string; relPath: string; size: number; mtimeMs: number; absPath: string }> = [];
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
    stdout: String(stdoutText),
    stderr: String(stderrText),
    errorMessage,
    artifacts,
  };
}

parentPort!.on('message', async (msg) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'run') {
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
        errorMessage: 'worker_error: ' + String(err && (err as PyRunError).message || err),
        artifacts: [],
      });
    }
  }
});

// Kick off boot. Post 'ready' once loadPyodide resolves.
await bootPyodide();

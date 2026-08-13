# Native Windows shell

This directory contains the first native React Native for Windows desktop
surface. It is intentionally kept as an independent lockstep project:

- React Native `0.84.1`
- React Native Windows `0.84.0`
- shared `@socrates/contracts` and `@socrates/core`

The Android/Web Expo app remains on React Native `0.86.2`; RNW `0.84.0` has a
peer dependency on RN `0.84.1`, so the two projects must not share a single
native dependency tree.

The Windows host project is generated on the GitHub `windows-latest` runner by
[`build-windows.yml`](../../.github/workflows/build-windows.yml). Generated
Visual Studio files and `node_modules` are deliberately not committed. The
current shell provides native Windows authentication, recent sessions, a
multi-column chat layout, SSE streaming, stop, and sign-out. More screens can
be moved into it after their platform adapters are covered.

Trigger it manually:

```bash
gh workflow run build-apk.yml \
  --ref <branch> \
  -f build_profile=debug \
  -f build_windows_only=true
```

After the workflow is merged to the default branch, `build-windows.yml` can
also be dispatched directly. Both paths use the hosted Windows image's
Visual Studio/WinAppSDK toolchain; this Linux workspace never runs the Windows
or Android native build locally.

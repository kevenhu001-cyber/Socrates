# Socrates Desktop Adapter Plan

The desktop strategy is to reuse the universal React Native screens and
shared TypeScript core, then add platform-native desktop projects when the
target build machines are available. The current `mobile/` app is an
Expo/RN 0.86.2 Android/Web application, while the current stable React Native
Windows line is 0.84 and the preview line is 0.85.0-preview.1. Installing
either into this app would create an unsupported RN peer-version mix, so the
native Windows shell must be a separate lockstep entry.

The browser desktop surface is already runnable through Expo Web and uses the
same RN screens. A full native Windows installer cannot be claimed from this
Linux workspace until the Windows runner completes the generated host build;
it requires the Windows toolchain and a matching RNW project.

The first native Windows shell now lives in [`windows/`](windows/). It is
generated and built independently on the GitHub `windows-latest` runner by
[`build-windows.yml`](../.github/workflows/build-windows.yml), pinned to the
RN 0.84.1 / RNW 0.84.0 pair. The shell currently covers native sign-in,
recent sessions, a multi-column chat surface, SSE streaming, stop, and
sign-out. It is a foundation for moving the remaining screens without
mixing RNW's dependency line into the Expo Android/Web app.

## Windows first

React Native for Windows is the first native desktop target. It must be added
to a dedicated desktop entry (or after an intentional RN downgrade/lockstep
upgrade), with a matching React Native major/minor version and initialized with
init-windows. RNW 0.84 declares react-native 0.84.1; RNW 0.85.0-preview.1
declares react-native ^0.85.0. There is no stable 0.86 RNW package to pin in
this repository today.

The Windows build requires a Windows machine with Visual Studio 2022, Windows
SDK 10.0.22621 or later, Developer Mode, and the WinAppSDK toolchain. This
Linux workspace can validate TypeScript, Metro, and shared business logic, but
cannot compile or run the WinAppSDK project itself.

Recommended Windows bootstrap, once a Windows build lane is available:

    npx @react-native-community/cli@latest init SocratesDesktop --version 0.84.1
    cd SocratesDesktop
    npm install react-native-windows@0.84.0
    npx react-native init-windows --overwrite
    npx react-native run-windows --arch x64

The desktop app should import screens and services from `mobile/src` only after
platform-specific modules are audited. The shared tree now has explicit
Windows implementations for storage, networking, notifications, startup,
clipboard, speech, status bar, deep links, sharing, browser opening, and file
picker boundaries. The remaining native shell work is the Windows WebView/file
picker/window adapter and a real multi-column desktop layout. The server
contract and `packages/core` remain unchanged.

The shared screen layer must be checked against these desktop-specific
constraints before enabling the shell:

- react-native-webview is not a substitute for a Windows WebView adapter.
- Expo-only modules in mobile/src/native/ need Windows implementations or
  platform-neutral fallbacks.
- The phone drawer should become a resizable multi-column workspace on desktop.
- File picking should use a Windows-native FileOpenPicker; the current Expo
  document picker is Android/Web scoped.

## macOS

React Native macOS is a separate platform adapter with its own Xcode-native
project and dependency compatibility matrix. It should follow Windows only
after the Windows desktop information architecture and keyboard/multi-column
layout are stable; macOS-specific menu bar, file system, and window behavior
should not leak into Android or Web.

## Desktop acceptance

- [ ] The same auth/session/SSE contract tests pass.
- [ ] Desktop uses keyboard focus, shortcuts, resizable columns, and an
      information-dense layout rather than enlarged phone cards.
- [ ] Native file selection, secure/session storage, sharing, and artifact
      preview have platform implementations.
- [ ] Windows CI builds a signed installer/package on a Windows runner.
- [ ] macOS CI builds and signs the app on a macOS runner.

## Version gate

Do not add a guessed react-native-windows@0.86 dependency. The RNW release
guide publishes matching React Native release lines; verify the package peer
dependencies with npm view react-native-windows@VERSION peerDependencies before
changing the desktop shell.

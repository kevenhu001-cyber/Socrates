# ADR 0021: Standalone Kotlin Android client

Status: accepted for the explicitly requested native Android implementation.

## Decision

Add `apps/socrates-android/` as a standalone Kotlin + Jetpack Compose application. This is an explicit exception to the previous Expo-only Android ownership rule, requested after the Universal App migration. Do not resurrect `mobile/`, Capacitor, or their retired build lanes. The existing `apps/socrates/` Universal App, shared TypeScript packages, SPA, and backend continue unchanged.

The native Android app uses the current `/api/v2` mobile bearer-token, session, multipart extraction, resource-directory, and SSE chat contracts. It has no WebView chat shell, JavaScript bridge, or embedded frontend runtime. Server-side LLM/provider credentials remain on the server.

## Native interaction and rendering

Use edge-to-edge system insets, the real Android input method, Compose spring/tween transitions, a gesture-enabled modal drawer, stable-key lazy message rows, and frame-coalesced streaming text updates. Markdown is rendered with native text/layout primitives. Voice dictation uses Android's installed recognition service, runtime microphone permission, and actual RMS input for the waveform; it is not a real-time bidirectional voice call.

## Scope and compatibility

The original implementation was intentionally limited. Subsequent 1.2/1.3 work adds generic native Markdown/LaTeX, account-backed management flows, provider selection, memory, message edit/regenerate/branch/feedback, real sharing, project-session moves, and actual exam/diagnostic generation and answering. The acceptance baseline is the actual Web/Expo clients and server behavior, not screenshot content. See `apps/socrates-android/PARITY.md` for the checked capability inventory and explicit gaps. Full project parity is not claimed: adaptive teaching, rich interactive artifacts, workspace editors, all preferences, offline mutation queues, background streaming guarantees, and full-duplex voice remain incomplete.

Diagnostic `tutorData` is local-only in the shared contract; the backend strips it. Native diagnostics therefore use encrypted local drafts scoped to server, verified account, and session, while only supported teaching fields sync to the server. A scalar save response must merge into the original session, never replace its full payload.

Retain unknown wire fields when loading/saving existing sessions and messages. Changing the API origin clears local authentication. Production disallows cleartext HTTP; emulator loopback is a debug-only development allowance. Do not store account passwords or provider secrets in application state or build configuration.

## Verification

A separate Android CI lane builds the application and runs JVM tests; it does not weaken or replace any existing gate. Compose instrumented tests exercise core navigation and account gating. Test screenshots must come from the actual installed native client, not a web mockup. Physical-device frame timing, keyboard variations, accessibility, voice-service availability, and thermal/network behavior must be measured before making a smoothness or production-readiness claim.

# Socrates — Frontend

The Socrates learning app is a **React/TypeScript** single-page web app
built with Vite. All user-facing surfaces are React-driven — the
legacy JavaScript modules (`main.js` etc.) act as a **state/event
backbone** that React reads from through typed bridge objects
(`window.__socrates*Bridge`).

A small `window.*` compatibility shim and a global event-delegation
layer bridge the remaining inline-handler pattern from the pre-migration
era.

## Layout

```
frontend/
├── index.html            # Markup (~52 KB)
├── src/
│   ├── styles.css        # All CSS (~3800 lines, ~146 KB)
│   ├── main.js           # State/event backbone (~8k lines)
│   ├── state.js          # Reactive state object (Proxy-based)
│   ├── i18n.js           # I18N dictionary + t()/setLang()
│   ├── windowExports.js  # Legacy window.* compat shim (~50 exports)
│   ├── types/            # TypeScript type definitions
│   ├── react/            # React/TS UI layers (23 modules, 102 files)
│   │   ├── bootstrap.tsx # Always-on runtime entry point
│   │   ├── chatRuntimeStore.ts
│   │   ├── useChatRuntime.ts
│   │   ├── message-list/ # Message bubbles, edit, regen, branching
│   │   ├── session-list/ # Recents list
│   │   ├── sidebar/      # Nav buttons + recents filter chips
│   │   ├── sidebar-chrome/ # App shell (header, footer)
│   │   ├── composer/     # "+" tools menu
│   │   ├── cmdk/         # Cmd-K command palette
│   │   ├── settings/     # Settings modal
│   │   ├── attachments/  # Attachment chip rows
│   │   ├── find-in-session/ # In-session search
│   │   ├── legacy/       # Typed bridge (gateway.ts, types.ts)
│   │   └── ...
│   ├── ui/               # Legacy UI modules
│   │   ├── delegate.js   # Global event delegation bridge
│   │   └── ...
│   ├── render/           # Markdown renderers
│   ├── chat/             # Chat/streaming logic
│   ├── session/          # Session management
│   ├── sidebar/          # Legacy sidebar state
│   ├── storage/          # Storage modal
│   ├── auth/             # Auth logic
│   └── ...
├── dist/                 # Built bundle (gitignored)
├── e2e/                  # Playwright e2e tests
├── package.json
├── vite.config.js
└── README.md
```

## Architecture

### React/TypeScript (always-on)

The React runtime is always loaded — the `?react=1` query flag was
removed in an earlier phase. `src/react/bootstrap.tsx` is imported
as part of the normal bundle and calls `createRoot` / `hydrateRoot`
for each surface that React owns.

React components **never access `window.*` directly**. Instead, they
go through a typed `getLegacyActions()` gateway
(`src/react/legacy/gateway.ts`) that returns namespaced action
objects (`domain.function()`). This keeps React decoupled from the
legacy global namespace.

### Legacy JS backbone

`main.js` remains the application's state/event backbone. It owns:

- The reactive `state` object (Proxy-based, shared with React via `useSyncExternalStore`)
- API call wrappers, SSE stream setup, and chat lifecycle
- The two custom Markdown renderers (`formatMsgProgressive` / `formatMsg`)
- Legacy event handlers dispatched through `delegate.js`

### Typed bridges

For each migrated surface, `main.js` publishes a typed bridge object
on `window.__socrates{Name}Bridge` that the corresponding React
component reads from via `useSyncExternalStore`. Examples:

| Bridge | Consumed by | Data published |
|---|---|---|
| `__socratesSessionListBridge` | `session-list/` | Session list, active session ID, filters |
| `__socratesSidebarNavBridge` | `sidebar/` | Active nav item |
| `__socratesAttachmentsBridge` | `attachments/` | Pending attachment list |
| `__socratesSettingsBridge` | `settings/` | Open state + body HTML |
| `__socratesCmdK` | `cmdk/` | Search state, results, open/close |
| `__socratesComposerToolsBridge` | `composer/` | Menu items, open state |

### Event delegation

All inline `onclick` / `onsubmit` / `onchange` attributes in
`index.html` have been replaced with `data-action` attributes.
A single listener in `src/ui/delegate.js` captures events on the
root element and dispatches to the correct handler via a
`data-action` → handler map, built during bootstrap from
`window.__socratesLegacy`.

## Migration status

The React/TypeScript migration is **~99% complete** (all user-facing
surfaces are React-driven). Remaining legacy code is limited to the
state/event backbone in `main.js`, which will be incrementally
migrated or replaced as React takes over more responsibilities.

Key milestones:

- [x] React runtime always-on (no `?react=1` flag)
- [x] Message list, editing, regeneration, branching — React-owned
- [x] Session list, sidebar nav, recents filter chips — React-owned
- [x] Cmd-K command palette — React-owned
- [x] Settings, storage, share, profile, usage modals — React-owned
- [x] Composer tools menu, attachment chips — React-owned
- [x] App shell (sidebar header/footer) — React-owned
- [x] Find-in-session — React-owned
- [x] Sidebar nav buttons + recents filter chips — React-owned
- [x] Typed `getLegacyActions()` bridge — all React components use it
- [x] `data-action` delegation replacing inline handlers
- [ ] Delete `windowExports.js` once no legacy reader remains (C4)
- [ ] Port remaining UI modules (`topicSetup.js`, `thinkingPill.js`, etc.)

## Validation

```sh
npm run typecheck      # TypeScript strict check
npm run build          # Vite production build
npx playwright test    # Full e2e suite (Playwright)
```

## Key dependencies

| Package | Purpose |
|---|---|
| React 19 | UI framework |
| Vite 5 | Build tool |
| `marked` 4.3 | Markdown (final render pass) |
| `katex` 0.16.9 | Math rendering |
| `highlight.js` | Code syntax highlighting |
| `fuse.js` | Cmd-K full-text search |
| `echarts` 6 | Charts in viz iframes |
| Playwright | E2e test framework |

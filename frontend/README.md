# Socrates — Frontend

The Socrates learning app is a single-page web app. The HTML markup
lives in [`index.html`](./index.html), the CSS in
[`src/styles.css`](./src/styles.css), and the JavaScript in
[`src/main.js`](./src/main.js).

Vite bundles these for production into [`dist/`](./dist/), which is
what the deploy script copies to
`/var/www/app.topodrive.top/`.

## Layout

```
frontend/
├── index.html          # Markup only (~52 KB)
├── src/
│   ├── styles.css      # All CSS (~146 KB, splits cleanly with Vite)
│   ├── state.js        # State object + Proxy (179 lines, standalone)
│   ├── i18n.js         # I18N dictionary + t()/setLang() (97 lines, standalone)
│   └── main.js         # App logic (~9.8k lines, imports state + i18n)
├── public/
├── dist/
├── package.json
├── vite.config.js
└── README.md
```

## Module split (Phase 2)

`main.js` is still 10 000 lines and monolithic. Three standalone
modules and one compat shim have been extracted:

| Module | Lines | Responsibility |
|---|---|---|
| `state.js` | 184 | State object, `STATE_FLAT_TO_NS`, Proxy, `resetState()` |
| `i18n.js` | 100 | `I18N`, `t()`, `setLang()`, `applyI18n()` |
| `main.js` (exports block) | 55 | `window` compat shim for onclick handlers |

### Backward-compat shim

All functions referenced from HTML inline `onclick` attributes are
exposed via `window.x = x` at the end of `main.js` (55 entries).
Without this, Vite's ES module scope hides them from the HTML
attributes. The list covers `toggleTheme`, `toggleModelPicker`,
`toggleExtensionsPicker`, `resetApp`, `startSession`, and ~50 more.

Future code should use `addEventListener` instead of inline
`onclick="…"` — the legacy names will stay on window for as long
as the old markup is in use.

The remaining modules (`api.js` for API calls, `views.js` for page
controllers, `utils.js` for helpers) are Phase 3 — deferred because
they have circular dependencies on each other that require
refactoring the cross-references into proper import/export chains.

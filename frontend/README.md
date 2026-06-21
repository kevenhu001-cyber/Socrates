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
├── index.html          # Markup only (~52 KB, down from 700 KB)
├── src/
│   ├── styles.css      # All CSS (~146 KB, splits cleanly with Vite)
│   └── main.js         # All app logic (~503 KB, minified to ~176 KB)
├── public/             # Static assets served as-is (currently empty)
├── dist/               # Build output (gitignored)
├── package.json
├── vite.config.js
└── README.md
```

## Commands

```bash
# Dev server with HMR (proxies /api to the live backend on :3037)
npm run dev

# Production build (outputs to dist/)
npm run build

# Preview the production build
npm run preview
```

## Deployment

`/home/ubuntu/Socrates/deploy.sh` runs `vite build` and copies
`dist/*` into the nginx web root. Run from the project root:

```bash
./deploy.sh
```

## Migration notes (split from monoline index.html)

The original `index.html` was a single 13,000-line file with all CSS
in one `<style>` block and all JS in one `<script>` block. This
folder is the first phase of the refactor — the modules are still
one big file each, but the structure is now:

- **index.html** — markup only
- **src/styles.css** — extracted as-is from the original `<style>` block
- **src/main.js** — extracted as-is from the original `<script>` block

The next phase (not done yet) is splitting `main.js` into ES modules
by responsibility: `state/`, `api/`, `views/`, `i18n/`, `utils/`.
Each module will re-export from a top-level `main.js` barrel.

## Build output

A typical build produces:

```
dist/index.html                  53 kB │ gzip: 12 kB
dist/assets/style-*.css         131 kB │ gzip: 21 kB
dist/assets/index-*.js          176 kB │ gzip: 58 kB
```

Total ~360 KB raw / 91 KB gzipped — down from the original 700 KB
inline bundle.

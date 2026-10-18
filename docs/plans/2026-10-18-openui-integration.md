# Socrates Open Intelligent UI integration

Socrates now embeds a curated library from
[thesysdev/open-intelligent-ui](https://github.com/thesysdev/open-intelligent-ui)
using `@openuidev/react-lang` 1.0.0. The upstream revision and MIT notice are in
`frontend/src/react/intelligence-ui/openui/UPSTREAM.md` and `LICENSE`.

## Model and rendering path

The existing `render_intelligent_ui` tool accepts a new node:

```json
{
  "version": 1,
  "nodes": [{
    "id": "planner",
    "type": "openui",
    "source": "root = Col([hours, result])\n$hours = 2\nhours = Slider($hours, 1, 8, 1, \"Hours per day\")\nresult = Text(\"Weekly hours: \" + ($hours * 7))"
  }]
}
```

The model receives exact positional component/function signatures through the
`source` property description. Regenerate after changing the library:

```sh
cd frontend
npm run generate:openui
```

`test/openUi.test.mjs` checks this generated server prompt for drift and parses
its example with the actual OpenUI parser. The backend imports only the plain
text prompt, never React. Existing provider configuration and tool execution,
turn events, patch revisions, persistence and replay continue to apply.

The SPA additionally recognizes fenced `openui` programs inside assistant prose,
including incomplete streamed programs. Fences keep a stable React key while
new statements arrive and the response settles. Copy/speech excludes source.
Existing `socrates-ui`/`sui` fences and native JSON nodes remain compatible.
Native `openui` nodes use the existing complete-node preview protocol: a node
appears once its JSON object is complete. Text fences can render statements
while the OpenUI source itself is still arriving.

## Supported interaction

- Layout: columns, rows, boxes, grids, cards, carousels and forms.
- Controls: text/number inputs, text areas, selects, segmented/radio choices,
  checkboxes, sliders, dates, countdown timers and buttons.
- Content: headings, text, captions, badges, safe links/images, tables, flip
  flashcards, bar/line/area/pie/donut/scatter charts and declarative SVG shapes.
- The upstream library's 59 functions cover list updates, math, unit conversion,
  text/date formatting and aggregation for charts.
- `$state`, `@Set` and `@Reset` run locally without model calls. `@ToAssistant`
  uses the existing chat action bridge and includes submitted form values.
  Read-only views cannot dispatch follow-up prompts. `@OpenUrl` accepts only
  credential-free absolute HTTP(S) links and opens with opener isolation.

Runtime code, styles and functions load only when an OpenUI view is used.
Local styles reference the Socrates palette, sizing and radius tokens, so the
same content works with light/dark themes and narrow screens.

The map and image-search follow-up adds `Map`, `MapMarker`, and `SearchImage`.
MapLibre and its worker are bundled and loaded on demand. OpenFreeMap geometry,
font glyphs, Photon place lookup, OSRM driving routes, and Wikimedia/DuckDuckGo/Bing image
results are reached only through authenticated `/api/intelligent-ui` routes.
Browser URLs use `/api/v2/intelligent-ui` and work with the existing prefix rewrite.
Map colors use the active Socrates palette; no CSP host expansion is needed.

`MapMarker(label, null, null, category, null, "landmark, city, country")` resolves
real coordinates and displays the matched address and OSM source. Verified
coordinates remain accepted. Maps are limited to twelve markers. Selection can
bind to a `$variable`; category filters, recentering and zoom operate locally.
Routes are explicitly driving overviews. Routing failure leaves selectable
places and a visible notice; it does not invent street geometry.

`SearchImage("subject and location")` searches Wikimedia Commons, then DuckDuckGo and Bing when
earlier sources are unavailable/empty. Unrelated Bing trending cards are rejected. Results have original source links; Commons also
supplies author/license when available. Images are proxied as raster bytes from
restricted provider hosts, with redirects rejected. Paging and retry run locally.
Empty results/outages are not saved as hour-long successful cache entries.
The existing Bing parser now handles both entity-encoded `m` attributes and
URL-encoded `mad` attributes, and recognizes the actual `murl` original field.

Server caches coalesce identical in-flight requests, bound metadata cardinality
and cap shared binary storage at 32 MiB. Upstream reads have byte/time limits;
image, tile and glyph paths reject arbitrary destinations. Sessions/credentials
are never forwarded upstream. HTTP asset caches are private and routes are
rate limited. Public provider availability is an external dependency; high-volume
installations should provision appropriate hosted/self-hosted map services.

The upstream Next.js shell, cloud gateway, telemetry, external embeds and HtmlView
remain outside this integration. No extra provider credentials are required.
Universal App keeps generic tool fallbacks until its artifact renderer migration.
Shared core remains DOM-free and carries only parsing/validation data.

References: [OpenFreeMap](https://openfreemap.org/quick_start/),
[Photon API and usage terms](https://photon.komoot.io/),
[OSRM API](https://project-osrm.org/docs/v5.24.0/api/),
[Wikimedia Imageinfo](https://www.mediawiki.org/wiki/API:Imageinfo).

## Validation and rollout

Focused coverage lives in `frontend/test/{intelligentUi,openUi}.test.mjs`,
`frontend/e2e/openui.spec.mjs`, the existing Intelligent UI showcase and turn
runtime tests, and `server/test/{intelligentUi,turnEvents}.test.js`.
Browser tests exercise actual rendered controls with mocked model responses;
they do not verify a particular live model provider's generation quality.

No database migration or deployment configuration changes are needed. Deploy
the server, shared core and SPA together to enable the new node type. Reverting
these changes restores the previous JSON-node implementation; older clients
can still show the generic tool result for persisted OpenUI calls. Interactive
control edits survive source extensions/patches on a mounted node, while
history restoration initializes controls from the saved program defaults.

Verified on 2026-10-18:

- Frontend lint (including architecture ratchets) and production build passed.
- Server and Universal App typechecks passed.
- Focused frontend unit files (`intelligentUi`, `openUi`, `entryGraph`,
  `turnRuntime`): 23 passed; focused server files (`intelligentUi`,
  `turnEvents`): 14 passed.
- Focused Playwright files (`openui`, `intelligent-ui-showcase`,
  `turn-event-runtime`, `chat-send`, `chat-stop-resend`, `streaming-render`,
  `message-list-compat`): 37 passed. Light, dark and mobile screenshots were
  inspected. The production graph contains 20 OpenUI modules, none eager.

The changes have not been deployed. The counts above describe the initial
component integration; follow-up media checks are recorded below.

### Map and image-search follow-up verification

- Frontend lint, production build, server typecheck, Universal App typecheck,
  service-boundary guard, DOM-free guard, external-host guard and CSP checks passed.
  The new endpoints' OpenAPI YAML parses successfully.
- Focused frontend unit files (`openUi`, `openUiMedia`, `intelligentUi`):
  19 passed. Focused server files (`intelligentUiMedia`, `intelligentUi`, `csp`):
  28 passed. Coverage includes encoded Bing metadata, provider fallback,
  query relevance, authentication, HTTP failure cache policy, URL/path bounds,
  media content types/size bounds, route coordinate order and cache eviction.
- `openui-media` + `openui` Playwright specs: 10 passed. They cover actual
  MapLibre canvas/markers, selection binding, category filters, geocoding,
  attributed photo paging, retries, source patches and existing OpenUI behavior.
- A separate temporary local Express media server with a QA auth fixture was
  connected to the production SPA bundle at `http://127.0.0.1:4173`. A live
  browser test passed with **real external data**: Paris vector tiles/glyphs,
  Photon-resolved Notre Dame, OSRM street geometry, and an Eiffel Tower photo
  resolved through DuckDuckGo with a Britannica source link. The final run
  observed 18 successful real tile responses and no page errors. Desktop
  1440×900 and phone 390×844 screenshots were inspected. Browser plugin/skill
  was not available; verification used the repository's Playwright installation.
- Direct upstream checks also returned an 80,887-byte root vector tile,
  76,580-byte glyph block, 143 route points / 4,303.8 meters between the Eiffel
  Tower and Louvre, and a 41,029-byte JPEG matching the Eiffel Tower query.
- The current runtime graph keeps all 25 OpenUI/MapLibre modules checked out
  of the eager entry chunks. Map worker/assets and every media request stay
  on the app origin; the CSP and first-party host allowlist are unchanged.

Wikimedia requests failed from this environment, demonstrating the need for the
working public-search fallbacks. Bing's HTML sometimes returned unrelated
trending cards, so the final fallback rejects those rather than displaying them
as a match. Public search/map provider availability is not a production SLA.
The browser tests above verify media/rendering, not a live LLM's generation of
OpenUI source. No database migration is required, and nothing was deployed.

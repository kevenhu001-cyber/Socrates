# Mobile reference contract — 2026-10-04

The six user-provided screenshots show home, the free account drawer, session
actions, plugins, the library and the account menu. Their 1200×2670 images
include 306px of Android/Chrome chrome. Compare the webpage at 390×769 CSS
pixels after excluding that browser area. Socrates keeps its brand and real
account, session, file and connector data.

| Surface | Reference geometry at 390px | Owner |
| --- | --- | --- |
| Header | 56px high, safe area added independently | `polish/mobile-shell.css` |
| Home | 16px side gutters, centered greeting at 40.5% of content height | `polish/mobile-shell.css` |
| Composer | two rows, 36px controls, 28px corners, 24px bottom clearance | `parity/composer-unified.css` |
| Drawer | 254px, 40px navigation/history rows, bottom account block | `polish/mobile-sidebar.css` |
| Directories | 36px search, 40px tabs/app icons, 60px file rows | `polish/mobile-directories.css` |
| Popovers | viewport-clamped portal, 40px rows, 20px corners | `menu/AnchoredMenu.tsx`, `components/sidebar.css` |
| Colors | black page, composer #212121, controls #383838, menus #353535 | `themes.css` |
| Text | locally bundled Inter and Noto Sans SC | `foundations/fonts.css`, `themes.css` |

`themes.css` remains imported exactly once and last. Repeated phone geometry
was removed from compatibility files instead of covered with another cascade
of `!important`. Historical global landing geometry is now desktop-scoped.
`check-mobile-css.mjs` prevents new phone shell and directory geometry outside
their owners. Existing composer and desktop surface guards remain in force.

Home and conversation share one composer DOM node. Its empty primary action
invokes existing browser speech input, a draft switches to Send, and streaming
switches to Stop. Default reasoning settings remain accessible through the
mobile title menu; non-default levels retain a composer chip. This uses browser
dictation and does not add a realtime voice API.

Reference account names, history titles, files and installed apps belong only
to test fixtures. Production renders actual service data. Android system font
contours can differ from the bundled face, and browser chrome is outside the
SPA, so those areas cannot carry a webpage pixel guarantee.

Follow-up: the user requested Library's heading/actions align with Plugins.
Both phone directories now start below the shared app bar with 20px top and
16px side padding. The Library heading is in normal flow with its New and
Settings actions, rather than fixed into the app bar. Desktop Library uses
the same centered column, heading inset and compact app bar as Plugins;
its former 15–17px horizontal bias has been retired.

Build before visual checks. Capture the six surfaces at 390×769 and also check
320px width, enlarged text preferences, short viewports, light mode and desktop.
Relevant regression specs are `mobile-reference`, `library-directory`,
`plugin-directory`, `composer-parity`, `voice-input`, `landing-light-visual`
and `theme-system`; run a subset instead of the full Playwright suite.

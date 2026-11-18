# Mobile reference update — 2026-10-18

The user supplied four current ChatGPT mobile-web screenshots and asked to
begin improving Socrates, especially its UI. This update supersedes the
home-header and drawer measurements in `mobile-reference-2026-10-04.md`;
directory and composer contracts from that reference remain applicable.

The 1200×2670 screenshots include Android/Chrome chrome. Normalize the web
surface to approximately 390×769 CSS pixels; do not recreate the browser bar.
Reference photos contain private account/history data and stay in gitignored
test evidence. Production uses Socrates branding and actual account data.

| Surface | Current contract | Owner |
| --- | --- | --- |
| Home header | Centered Chat/Tutor segment using the existing mode state; a compact, labelled model-settings action on the right | `polish/mobile-shell.css` |
| Active conversation | Mode tabs hidden; model name and new-chat action remain available | `parity/topbar.css` and existing mode lifecycle |
| Home | Preserve quiet centered greeting and bottom composer; retain draft when changing mode before a session | existing home/composer owners |
| Drawer | `min(280px, 65vw)`, approximately 254px at 390px; logo/search/close header | `tokens.css`, `polish/mobile-sidebar.css` |
| Navigation | New chat, Library, Projects, Scheduled, Plugins, then Images/Sites according to actual account capability, More | `polish/mobile-sidebar.css` |
| Project shortcut | Separate Create project button beside the Projects navigation button; no nested interactive controls | React sidebar navigation |
| Recents | Organization menu selects List or Group by project; preference persists locally; archived chats remain an explicit action | `RecentsHeader.tsx`, `organization.store.ts` |
| Grouped chats | Pinned first, project groups in recency order, other chats last; existing search and tag filters still apply | `SessionTimeline.tsx`, `projectGroups.ts` |
| Account menu | Anchored above the account row and clamped to the viewport; identity and separated action groups | existing account/menu components |

Intentional deviations: retain the shipped 48px drawer touch rows; ChatGPT's
Work is not renamed into an unsupported Socrates feature; the right header
action is explicitly model settings rather than guessing an unlabelled icon's
behavior. Microphone/waveform capabilities are unchanged in this UI iteration.
No new palette is introduced, and `themes.css` stays unique and last.

Focused checks: `mobile-ui-alignment`, `mobile-reference`,
`reference-ui-visual`, `sidebar-nav`, `topbar-model-switcher`,
`chat-workbench`, and `anchored-menu-focus`. Browser evidence is stored under
`frontend/test-results/`, never committed. Also inspect 320px width, enlarged
text, light/dark modes, and desktop after a production build.

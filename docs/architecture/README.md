# Architecture docs — index

This directory holds the **current** description of how Socrates is built.
If a statement here disagrees with the code, the code wins and this page is
the bug — file the fix the same way you would a code bug.

Everything else under `docs/` is **history**, not specification:

| Directory | What it is | Trust it for |
|---|---|---|
| `docs/architecture/` | Current architecture description (this directory) | How the system works today |
| `docs/adr/` | Architecture Decision Records | **Why** a decision was made (and what was rejected) |
| `docs/audits/` | Dated, immutable review snapshots | History and rationale only — see `docs/audits/README.md` |
| `docs/plans/` | Dated plans and handoff notes | History and intent only |
| `docs/reviews/`, `docs/ref/` | Point-in-time UI reviews and reference captures | The specific measurement they record, at its date |

**Rule:** for current behaviour read this directory and the root `AGENTS.md`.
For the reasoning behind a decision read `docs/adr/`. For "what did we used to
do, and why did we change it" read `docs/audits/` and `docs/plans/` — and
always check the date in the filename, because several of those documents
describe structures that no longer exist.

## Files in this directory

- [`mental-model.md`](./mental-model.md) — the shortest accurate map of the
  running system: composition roots, one chat turn, the state model, and the
  client boundaries. **Start here** if you are new to the codebase.
- [`naming.md`](./naming.md) — the naming and file-layout rules: what
  `.store.ts` / `.service.ts` / `.bridge.ts` / `.impl.ts` mean, the canonical
  message and turn shapes, and the dialects that are forbidden in new code.
- [`ui-structure.md`](./ui-structure.md) — the frontend UI architecture in
  detail (Chinese): client responsibilities, the SPA entry point and
  dependency direction, React root lifecycle, the page-loading protocol,
  transcript/share protocol, styling ownership, and the remaining migration
  debt with its processing order.

## Related entry points

- [`../../AGENTS.md`](../../AGENTS.md) — repository ownership, risk routes,
  the architecture-guard ratchets, and the incremental testing rules.
- [`../../README.md`](../../README.md) / [`../../README.zh.md`](../../README.zh.md)
  — product overview, repository layout, and quick start.
- [`../adr/README.md`](../adr/README.md) — how to write and read an ADR.
- [`../audits/README.md`](../audits/README.md) — the banner that explains why
  an audit file is a snapshot and not a specification.
- [`../STRUCTURE.md`](../STRUCTURE.md) — directory-by-directory map of the
  repository tree.
- [`../api/openapi.yaml`](../api/openapi.yaml) — the HTTP contract shared by
  the SPA, the server, and the native Android client.
- [`../ops/runbook.md`](../ops/runbook.md) — operational runbook.

## A note on language

`mental-model.md` and `naming.md` are written in English; `ui-structure.md`
is written in Chinese. Both are kept, and both are maintained — pick the one
you read faster, but treat them as equally binding.

## Keeping this directory truthful

- If you retire a module, a global, or a directory, update the affected
  paragraph here in the same change that removes it. Stale "still live"
  claims are the failure mode this index exists to prevent.
- Do not add dated snapshots to this directory. A file with a date in its
  name belongs in `docs/audits/` or `docs/plans/`.
- The guard `npm run lint:docs` checks that links in the root entry documents
  point at paths that actually exist.

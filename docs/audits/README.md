# Audits — dated snapshots, not specifications

**Every file in this directory is an immutable, dated snapshot**, captured at
the moment it was written. None of them is maintained afterwards.

Several of them describe structures that **no longer exist**. The most
frequent example: [`2026-09-20-structural-review.md`](./2026-09-20-structural-review.md)
was written against a `frontend/src/main.js` tree, before the frontend
migrated to TypeScript; it also analyses an `open-connector/` sidecar topology
that was removed on 2026-09-26 (ADR 0014), and it treats `state/` vs `store/`
as a live duplication — `frontend/src/state/store.ts` has since been deleted.
Reading it as a description of the current repository will send you to files
that are not there.

The same is true of the other dated audits: they record what was true on
their date, including findings that were later fixed, findings that were
later rejected, and migrations that later changed shape.

## Why keep them?

The reasoning behind a change, and the state of the world before it, are
worth keeping. They explain why the current tree looks the way it does, and
they let a later reader tell a regression apart from a deliberate change.

They are kept **for rationale and history only**.

## The rule

- **Current behaviour** → read [`../architecture/`](../architecture/) and the
  root [`AGENTS.md`](../../AGENTS.md). Those describe the system as it is now.
- **Reasoning behind a decision** → read [`../adr/`](../adr/). An ADR is the
  record of a decision; it states the context, the rejected alternatives, and
  the reversibility.
- **History and snapshots** → read this directory and
  [`../plans/`](../plans/). Treat every statement as *"this was true on the
  date in the filename"*.

## Conventions when reading an audit

1. Read the date in the filename first, then check that date against the
   repository history before believing any structural claim.
2. Prefer the newest audit for a topic, and confirm its claims against the
   code anyway — audits describe intent and findings, not current truth.
3. Never cite an audit as evidence that something exists. Cite the file, or
   the ADR, or the guard that enforces it.
4. Do not edit these files to "fix" them. They are snapshots; a correction
   belongs in a new dated document, or in `docs/architecture/`.

## Related

- [`../architecture/README.md`](../architecture/README.md) — the index of the
  current architecture documentation.
- [`../adr/README.md`](../adr/README.md) — the ADR index and writing rules.

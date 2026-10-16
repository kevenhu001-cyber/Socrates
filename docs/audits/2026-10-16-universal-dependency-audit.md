# Universal App dependency audit

Date: 2026-10-16. Command: `node scripts/audit-ratchet.mjs apps/socrates`.

Adding the previously uncovered application to the security matrix exposes 18
high-severity package findings. They propagate from two root advisories:

| Root | Installed | Advisory | Dependency path |
| --- | --- | --- | --- |
| braces | 3.0.3 | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | Expo → Metro → metro-file-map → micromatch → braces |
| node-forge | 1.4.0 | [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | Expo CLI → code-signing-certificates / node-forge |

The registry's current latest versions match these installed versions at the
time of review. The braces advisory explicitly lists no patched version.
`npm audit` proposes a major Expo downgrade to 44.0.6; that is not a compatible
fix for the Expo 57 / React Native 0.86 application.

No exceptions were added to the audit baseline. The newly added Universal App
audit job consequently fails until a real upstream fix or a separately reviewed
mitigation is available. This is an explicitly recorded merge blocker, not a
claim that the application has been made vulnerability-free.

The inspected dependency paths are build/development tooling. This reduces the
evidence for exposure in a static production export, but it does not by itself
prove absence from every shipped bundle or protect a development server exposed
to untrusted clients. Do not expose Metro/Expo development servers publicly.

Follow-up: verify upstream patches, test a supported Expo update or narrowly
scoped maintained patch, rerun dependency audit, web export and native export,
then close the blocker. A separate moderate `uuid` finding also remains.

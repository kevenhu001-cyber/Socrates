# Marketing site legal fact audit

Date: 2026-08-12

This is a factual consistency review of the static Privacy Policy and Terms
pages. It is not a legal opinion or a certification of compliance.

## Repository-backed facts

| Claim area | Evidence | Published wording |
| --- | --- | --- |
| API-key encryption | `server/src/lib/crypto.ts`, `server/src/routes/apiKeys.ts` | API keys use AES-256-GCM at rest. The encryption key is derived from the server `SESSION_SECRET`. |
| API-key exposure | `server/src/routes/apiKeys.ts` | API-key list responses expose metadata and `hasKey`; ciphertext is not returned to the browser. |
| API-key deletion | `server/src/routes/apiKeys.ts` | Authenticated users can delete individual provider keys. |
| Account deletion/export | `server/src/routes/auth.ts`, `server/src/routes/account.ts`, `server/src/services/auth.ts` | The product exposes account deletion and data export flows. Exact third-party or backup deletion timing is not promised. |
| File storage | `server/src/routes/files.ts`, `server/src/routes/sessions.ts` | Upload storage is controlled by `UPLOAD_DIR`, with a local temporary directory as the development default. The policy does not name AWS. |
| Session security | `server/src/services/auth.ts` and auth middleware | Authentication uses server-side sessions and CSRF protection. Cookie and retention details remain deployment-sensitive. |

## Claims removed or made deployment-sensitive

- Universal TLS 1.3, encryption of every stored data category, and encryption
  keys stored separately from application data.
- AWS as the hosting provider, fixed processor/DPA promises, and a universal
  email provider.
- Fixed analytics retention, server-log retention, payment-record retention,
  backup retention, and “deleted within 30 days” promises.
- A guaranteed 99.5% uptime SLA, fixed maintenance windows, and automatic
  service-credit calculations.
- Specific trial/refund schedules that were not consistently represented by
  the current checkout flow.
- The unassigned DPO mailbox and the placeholder California phone number.

## Operator review still required

Before publishing a jurisdiction-specific legal commitment, confirm the legal
entity name, registered address, governing law and dispute forum, age policy,
regional privacy notices, processor list, payment-provider details, and any
required PIPL/GDPR/CCPA language. The English and Chinese pages should be
updated together when any of these facts are confirmed.

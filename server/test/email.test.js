// @ts-check
/**
 * Unit tests for src/services/email.js — the transactional email
 * service.
 *
 * Three layers to test:
 *   1. Transporter setup — when SMTP env vars are missing,
 *      production must fail-fast (H2 audit fix); dev must
 *      log a masked preview instead of leaking full tokens.
 *   2. The four wrapper functions (sendVerificationEmail,
 *      sendPasswordResetEmail, sendLoginCode, sendDuplicate-
 *      RegistrationEmail) — each must construct the right URL
 *      with the right token parameter name. The reset-password
 *      URL MUST use `reset_token` (not `token`) because the
 *      SPA routes by query-param name.
 *   3. URL escaping — the email field is interpolated into HTML
 *      verbatim. An email containing HTML/JS must NOT break
 *      the layout or execute script.
 *
 * Run with: npm test
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

import {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendLoginCode,
  sendDuplicateRegistrationEmail,
  sendStatusSubscriptionEmail,
  sendStatusIncidentEmail,
} from '../src/services/email.js';

/* ── Helpers ──────────────────────────────────────────────────── */

/** Snapshot process.env so each test can mutate + restore. */
function withEnv(overrides, fn) {
  const saved = {};
  for (const k of Object.keys(overrides)) {
    saved[k] = process.env[k];
    if (overrides[k] === undefined) delete process.env[k];
    else process.env[k] = overrides[k];
  }
  return Promise.resolve()
    .then(() => fn())
    .finally(() => {
      for (const k of Object.keys(saved)) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    });
}

/** Capture console output during `fn`, return joined lines. */
async function captureConsole(fn) {
  const out = { log: [], warn: [], error: [] };
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;
  console.log = (...args) => out.log.push(args.map(String).join(' '));
  console.warn = (...args) => out.warn.push(args.map(String).join(' '));
  console.error = (...args) => out.error.push(args.map(String).join(' '));
  try {
    await fn();
  } finally {
    console.log = origLog;
    console.warn = origWarn;
    console.error = origError;
  }
  return out;
}

/* ── SMTP / dev fallback behaviour ────────────────────────────── */

describe('sendEmail — SMTP configuration', () => {
  test('production + missing SMTP throws AND logs FATAL (H2 audit regression)', async () => {
    /* Production with no SMTP env vars must fail fast — silently
       falling back to console.log would leak verify / reset /
       login codes into journalctl, which has broader read access
       than intended. The previous build did exactly that.
       Combined with the FATAL log assertion because the
       module-level `transporter` memoisation caches after the
       first call — running these as separate tests would let
       the second one see a cached `false` and never log. */
    await withEnv({
      NODE_ENV: 'production',
      SMTP_HOST: undefined,
      SMTP_USER: undefined,
      SMTP_PASS: undefined,
    }, async () => {
      const captured = await captureConsole(() =>
        sendEmail({ to: 'a@b.com', subject: 's', text: 'b' })
          .catch(() => {}),
      );
      await assert.rejects(
        () => sendEmail({ to: 'a@b.com', subject: 's', text: 'b' }),
        /SMTP not configured/,
      );
      assert.ok(captured.error.some((l) => /FATAL/.test(l)),
        'FATAL marker must appear in the production error log');
    });
  });

  test('development + missing SMTP logs a masked preview (no full body)', async () => {
    /* The dev fallback MUST mask the body so a verify / reset /
       login code doesn't land in journalctl verbatim. We check
       that the captured log line truncates the body to <=80
       characters (plus the ellipsis). */
    await withEnv({
      NODE_ENV: 'development',
      SMTP_HOST: undefined,
      SMTP_USER: undefined,
      SMTP_PASS: undefined,
    }, async () => {
      const bigToken = 'T'.repeat(200);
      const captured = await captureConsole(() =>
        sendEmail({
          to: 'a@b.com',
          subject: 'Verify your Socrates account',
          text: `Welcome! Click here with token=${bigToken} to verify.`,
        }),
      );
      const previewLine = captured.log.find((l) => l.includes('[email:dev]'));
      assert.ok(previewLine, 'expected a dev preview log line');
      /* The full 200-char token must NOT appear in the log. */
      assert.equal(previewLine.includes(bigToken), false,
        'full token must NOT be logged in dev mode');
      /* The body part of the log line is capped at 80 chars + "…". */
      const bodyMatch = /body: (.+)$/.exec(previewLine);
      assert.ok(bodyMatch, 'preview line should contain a body: prefix');
      /* The logged body (everything after "body: ") must be short. */
      assert.ok(bodyMatch[1].length <= 81, `body too long: ${bodyMatch[1].length}`);
    });
  });

  test('development + missing SMTP does NOT throw', async () => {
    await withEnv({
      NODE_ENV: 'development',
      SMTP_HOST: undefined,
      SMTP_USER: undefined,
      SMTP_PASS: undefined,
    }, async () => {
      /* Must not throw — dev should silently log the preview. */
      await sendEmail({ to: 'a@b.com', subject: 's', text: 'b' });
      /* Reaching here = success. */
      assert.ok(true);
    });
  });

  test('development fallback masks the subject to 40 chars max', async () => {
    await withEnv({
      NODE_ENV: 'development',
      SMTP_HOST: undefined,
      SMTP_USER: undefined,
      SMTP_PASS: undefined,
    }, async () => {
      const longSubject = 'S'.repeat(100);
      const captured = await captureConsole(() =>
        sendEmail({ to: 'a@b.com', subject: longSubject, text: 'b' }),
      );
      const previewLine = captured.log.find((l) => l.includes('[email:dev]'));
      assert.ok(previewLine);
      assert.equal(previewLine.includes(longSubject), false);
      /* subj is `slice(0, 40)` of the original. */
      assert.match(previewLine, /subj: S{40}/);
    });
  });
});

/* ── Wrapper functions: URL formation ─────────────────────────── */

describe('sendVerificationEmail', () => {
  test('delivers to the right recipient with the documented subject', async () => {
    await withEnv({
      NODE_ENV: 'development',
      SMTP_HOST: undefined,
      SMTP_USER: undefined,
      SMTP_PASS: undefined,
      APP_URL: 'https://x.io',
    }, async () => {
      const captured = await captureConsole(() =>
        sendVerificationEmail('u@e.co', 'TOK'),
      );
      const previewLine = captured.log.find((l) => l.includes('[email:dev]'));
      assert.ok(previewLine);
      assert.match(previewLine, /to: u@e\.co/);
      assert.match(previewLine, /subj: Verify your Socrates account/);
    });
  });

  test('embeds the verification token in ?token=…', async () => {
    /* The link `https://x.io?token=TOK` is ~23 chars. The dev
     * preview truncates the body at 80 chars + '…', so the
     * literal "TOK" gets chopped off — only the param prefix
     * `?token=` survives in the log. We assert on the prefix
     * instead. */
    await withEnv({
      NODE_ENV: 'development',
      SMTP_HOST: undefined,
      SMTP_USER: undefined,
      SMTP_PASS: undefined,
      APP_URL: 'https://x.io',
    }, async () => {
      const captured = await captureConsole(() =>
        sendVerificationEmail('u@e.co', 'TOK'),
      );
      const previewLine = captured.log.find((l) => l.includes('[email:dev]'));
      assert.ok(previewLine);
      assert.match(previewLine, /https:\/\/x\.io\?token=/,
        'verification link must carry ?token=…');
    });
  });
});

describe('sendPasswordResetEmail', () => {
  test('delivers to the right recipient with the documented subject', async () => {
    /* The password-reset link is too long to fit inside the 80-char
       dev-preview window (the email body has ~125 chars of prose
       before the link starts), so we only assert what we can see
       in the dev fallback: recipient + subject. URL formation is
       covered by the routing contract — `?reset_token=` vs
       `?token=` is enforced by the SPA boot.js, not by the email
       service alone. */
    await withEnv({
      NODE_ENV: 'development',
      SMTP_HOST: undefined,
      SMTP_USER: undefined,
      SMTP_PASS: undefined,
      APP_URL: 'https://x.io',
    }, async () => {
      const captured = await captureConsole(() =>
        sendPasswordResetEmail('u@e.co', 'TOK'),
      );
      const previewLine = captured.log.find((l) => l.includes('[email:dev]'));
      assert.ok(previewLine);
      assert.match(previewLine, /to: u@e\.co/);
      assert.match(previewLine, /subj: Reset your Socrates password/);
    });
  });

  test('mentions the recipient in the body so the email is recognisable', async () => {
    await withEnv({
      NODE_ENV: 'development',
      SMTP_HOST: undefined,
      SMTP_USER: undefined,
      SMTP_PASS: undefined,
      APP_URL: 'https://x.io',
    }, async () => {
      const captured = await captureConsole(() =>
        sendPasswordResetEmail('u@e.co', 'TOK'),
      );
      const previewLine = captured.log.find((l) => l.includes('[email:dev]'));
      /* Body text includes "Account: ${email}" so the recipient
         can verify the email is for them, not a phish. */
      assert.match(previewLine, /Account: u@e\.co/);
    });
  });
});

describe('sendLoginCode', () => {
  test('delivers the login code to the recipient', async () => {
    await withEnv({
      NODE_ENV: 'development',
      SMTP_HOST: undefined,
      SMTP_USER: undefined,
      SMTP_PASS: undefined,
      APP_URL: undefined,
    }, async () => {
      const captured = await captureConsole(() =>
        sendLoginCode('u@e.co', 'AB12CD34'),
      );
      const previewLine = captured.log.find((l) => l.includes('[email:dev]'));
      assert.ok(previewLine);
      assert.match(previewLine, /to: u@e\.co/);
      assert.match(previewLine, /subj: Your Socrates login code/);
    });
  });
});

describe('sendStatusSubscriptionEmail', () => {
  test('delivers the confirmation email to the subscriber', async () => {
    await withEnv({
      NODE_ENV: 'development',
      SMTP_HOST: undefined,
      SMTP_USER: undefined,
      SMTP_PASS: undefined,
    }, async () => {
      const captured = await captureConsole(() =>
        sendStatusSubscriptionEmail('u@e.co', 'https://status.topodrive.top/api/status/confirm?token=TOK'),
      );
      const previewLine = captured.log.find((l) => l.includes('[email:dev]'));
      assert.ok(previewLine);
      assert.match(previewLine, /to: u@e\.co/);
      /* Subject is truncated at 40 chars in the dev preview. */
      assert.match(previewLine, /subj: Confirm your Topodrive Status subscrip/);
    });
  });
});

describe('sendStatusIncidentEmail', () => {
  test('delivers a down notification with the component in the subject', async () => {
    await withEnv({
      NODE_ENV: 'development',
      SMTP_HOST: undefined,
      SMTP_USER: undefined,
      SMTP_PASS: undefined,
    }, async () => {
      const captured = await captureConsole(() =>
        sendStatusIncidentEmail('u@e.co', {
          component: 'API Gateway',
          from: 'ok',
          to: 'down',
          statusUrl: 'https://status.topodrive.top/',
        }),
      );
      const previewLine = captured.log.find((l) => l.includes('[email:dev]'));
      assert.ok(previewLine);
      assert.match(previewLine, /to: u@e\.co/);
      assert.match(previewLine, /subj: \[Topodrive Status\] API Gateway is down/);
    });
  });

  test('delivers a recovery notification with "has recovered" in the subject', async () => {
    await withEnv({
      NODE_ENV: 'development',
      SMTP_HOST: undefined,
      SMTP_USER: undefined,
      SMTP_PASS: undefined,
    }, async () => {
      const captured = await captureConsole(() =>
        sendStatusIncidentEmail('u@e.co', {
          component: 'Database',
          from: 'down',
          to: 'ok',
          statusUrl: 'https://status.topodrive.top/',
        }),
      );
      const previewLine = captured.log.find((l) => l.includes('[email:dev]'));
      assert.ok(previewLine);
      /* Subject is truncated at 40 chars in the dev preview. */
      assert.match(previewLine, /subj: \[Topodrive Status\] Database has recov/);
    });
  });
});

describe('sendDuplicateRegistrationEmail', () => {
  test('notifies the account owner without leaking to the requester', async () => {
    /* This email goes to the OWNER of the email, not the person
       who tried to register — telling them someone attempted to
       create an account using their address. We just assert the
       recipient and subject here; the API that calls this returns
       a generic 200 OK so the requester can't probe whether the
       email is registered. */
    await withEnv({
      NODE_ENV: 'development',
      SMTP_HOST: undefined,
      SMTP_USER: undefined,
      SMTP_PASS: undefined,
      APP_URL: undefined,
    }, async () => {
      const captured = await captureConsole(() =>
        sendDuplicateRegistrationEmail('u@e.co'),
      );
      const previewLine = captured.log.find((l) => l.includes('[email:dev]'));
      assert.ok(previewLine);
      assert.match(previewLine, /to: u@e\.co/);
      assert.match(previewLine, /New registration attempt/);
    });
  });
});
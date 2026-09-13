import nodemailer, { type Transporter } from 'nodemailer';

// NOTE: must start as `undefined` (not null) — the memoization guard
// below is `transporter !== undefined`, so initialising to null would
// short-circuit on the first call and never build the transport,
// making every send throw "SMTP not configured" even when SMTP env
// is present.
let transporter: Transporter | false | undefined;

function getTransporter() {
  if (transporter !== undefined) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    // P_email-fallback-leak — H2 audit fix. In production we MUST NOT
    // fall back to console.log: tokens (verify/reset/login codes) would
    // land in journalctl, which has broader read access than intended.
    // Surface a startup-time error instead; developers must configure
    // real SMTP. In dev, allow the fallback but mask the body.
    if (process.env.NODE_ENV === 'production') {
      console.error('[email] FATAL: SMTP not configured in production. Set SMTP_HOST/SMTP_USER/SMTP_PASS and restart.');
      transporter = false;
      return false;
    }
    console.warn('[email] SMTP not configured — dev mode, will log masked preview');
    transporter = false;
    return false;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT || '465', 10),
    secure: SMTP_SECURE !== 'false',
    auth: { user: SMTP_USER, pass: SMTP_PASS || '' },
  });

  return transporter;
}

/**
 * Send an email. Production requires SMTP — fails fast if missing.
 * Dev mode logs a masked preview (first 40 chars of subject, body truncated).
 */
export async function sendEmail({ to, subject, text, html }: {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}) {
  const t = getTransporter();
  if (!t) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SMTP not configured — cannot deliver transactional email');
    }
    // Dev-only masked log; never print the full body or token.
    const subjMask = (subject || '').slice(0, 40);
    const bodyMask = ((text || html || '').replace(/\s+/g, ' ').slice(0, 80) + '…');
    console.log(`[email:dev] masked preview — to: ${to}, subj: ${subjMask}, body: ${bodyMask}`);
    return;
  }
  try {
    await t.sendMail({
      from: `"Socrates" <${process.env.SMTP_USER || 'noreply@addtech.site'}>`,
      to,
      subject,
      text,
      html,
    });
  } catch (err) {
    console.error('[email] Failed to send:', (err as Error).message);
    throw err;
  }
}

/* ──────────────────────────────────────────────
   Email layout
   ──────────────────────────────────────────────
   Elegant monochrome transactional style.

   Palette (strict greyscale; no accent color, no card).
   Values mirror the lobehub tokens used by the live app
   (frontend/src/styles/themes.css `[data-mode="light"]`
   --lobe-* block) so the email reads as the same product:

     page bg     #ffffff
     ink         #080808  (headings, button)
     body        #666666  (paragraphs)
     muted       #999999  (footer, helper text)
     hairline    #e3e3e3  (1px rules)
     code-bg     #fafafa  (login-code block)

   Typography:
     wordmark    Inter 17 / 600, -0.025em
     heading     Inter 26 / 600, -0.02em (line-height 1.25)
     body        Inter 15 / 400, line-height 1.6, color #666666
     micro       Inter 12 / 400, line-height 1.5, color #999999
     code        JetBrains Mono 32 / 500, 0.4em tracking

   Geometry (matches `--lobe-radius` = 8px):
     logo        28 px, 8 px corner
     button      11 px 24 px padding, 8 px corner, height ~36 px

   Single-column 540 px stack. Generous vertical rhythm.
   No card, no shadows, no icons, no badges — only
   typography, white space, and a single hairline divider.
   ────────────────────────────────────────────── */
function shell({ preheader, title, body }: { preheader?: string; title: string; body: string }) {
  const pre = preheader || '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>${title}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap');
</style>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#080808;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility">
<span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden">${pre}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff">
  <tr>
    <td align="center" style="padding:64px 16px 48px">
      <table role="presentation" width="540" cellpadding="0" cellspacing="0" border="0" style="max-width:100%;width:100%">

        <!-- Brand — logo mark + wordmark, tight left-aligned. -->
        <tr>
          <td align="left" style="padding:0 0 56px">
            <img src="https://app.topodrive.top/logo.png" alt="Socrates" width="28" height="28" style="display:block;width:28px;height:28px;border:0;border-radius:8px" />
            <div style="margin-top:12px;font-family:'Inter',-apple-system,sans-serif;font-size:17px;font-weight:600;letter-spacing:-0.025em;color:#080808;line-height:20px">
              Socrates
            </div>
          </td>
        </tr>

        <!-- Body slot -->
        <tr>
          <td style="font-size:15px;line-height:1.6;color:#666666">
            ${body}
          </td>
        </tr>

        <!-- Hairline + footer -->
        <tr>
          <td style="padding:48px 0 0">
            <div style="height:1px;background:#e3e3e3;line-height:1px;font-size:1px">&nbsp;</div>
            <div style="padding-top:20px;font-size:12px;line-height:1.5;color:#999999;letter-spacing:-0.005em">
              <a href="https://topodrive.top" style="color:#999999;text-decoration:none">Socrates</a> · an AI tutor that asks questions to help you think.
            </div>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/* Primary button. Solid ink, white label, 8 px radius, weight 500.
 * Sized to match the lobehub `--lobe-control` (36 px tall): 11 px
 * vertical padding around a 14 px label gives ~36 px rendered height
 * in clients that honour line-height. */
function ctaButton(label: string, href: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="left" style="margin:32px 0 8px">
    <tr>
      <td align="center" bgcolor="#080808" style="border-radius:8px">
        <a href="${href}" target="_blank" style="display:inline-block;padding:11px 24px;font-family:'Inter',-apple-system,sans-serif;font-size:14px;line-height:1.4;font-weight:500;color:#ffffff;text-decoration:none;letter-spacing:-0.005em;border-radius:8px">${label}</a>
      </td>
    </tr>
  </table>`;
}

/* Hairline-divider helper — pure 1 px rule, no decoration. */
function hairline() {
  return `<div style="height:1px;background:#e3e3e3;line-height:1px;font-size:1px;margin:24px 0">&nbsp;</div>`;
}

/* Fallback URL — quiet, monospaced, sits below the button. */
function fallbackLink(link: string) {
  return `<p style="margin:8px 0 0;font-size:12px;line-height:1.6;color:#999999;word-break:break-all">
    Or paste this link into your browser:
  </p>
  <p style="margin:4px 0 0;font-family:'JetBrains Mono','SF Mono',Menlo,Consolas,ui-monospace,monospace;font-size:12px;line-height:1.6;color:#666666;word-break:break-all">
    <a href="${link}" style="color:#666666;text-decoration:underline;text-decoration-color:#e3e3e3">${link}</a>
  </p>`;
}

/* Plain-text joiner for the no-HTML / log-only fallback. */
function textWrap(parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join('\n\n');
}

/**
 * Send a verification email.
 */
export async function sendVerificationEmail(email: string, token: string) {
  const baseUrl = process.env.APP_URL || 'https://app.topodrive.top';
  const link = `${baseUrl}?token=${token}`;

  const body = `
    <h1 style="margin:0 0 16px;font-family:'Inter',-apple-system,sans-serif;font-size:26px;font-weight:600;color:#080808;line-height:1.25;letter-spacing:-0.02em">
      Verify your email
    </h1>
    <p style="margin:0;font-family:'Inter',-apple-system,sans-serif;font-size:15px;line-height:1.6;color:#666666">
      Welcome to Socrates. Confirm this address to activate your account and save sessions across devices.
    </p>
    ${ctaButton('Verify email', link)}
    ${fallbackLink(link)}
    <p style="margin:32px 0 0;font-family:'Inter',-apple-system,sans-serif;font-size:12px;line-height:1.6;color:#999999">
      This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.
    </p>
  `;

  await sendEmail({
    to: email,
    subject: 'Verify your Socrates account',
    text: textWrap([
      'Welcome to Socrates!',
      'Verify your email by opening this link:',
      link,
      'This link expires in 24 hours. If you did not create an account, you can ignore this email.',
    ]),
    html: shell({
      preheader: 'Confirm your email to finish setting up Socrates.',
      title: 'Verify your Socrates account',
      body,
    }),
  });
}

/**
 * Send a password-reset email.
 */
export async function sendPasswordResetEmail(email: string, token: string) {
  const baseUrl = process.env.APP_URL || 'https://app.topodrive.top';
  /* IMPORTANT: URL param is `reset_token` (NOT `token`). The SPA's
     boot.js distinguishes email-verification from password-reset by
     the param name — `token` triggers /api/auth/verify, `reset_token`
     triggers the reset-password view. Sending `?token=` here would
     route reset clicks through the verification endpoint, which
     looks up `pendingRegistrations` (not the reset table) and returns
     "Invalid or expired verification token" even though the reset
     row itself is fresh. */
  const link = `${baseUrl}/reset-password?reset_token=${token}`;

  const body = `
    <h1 style="margin:0 0 16px;font-family:'Inter',-apple-system,sans-serif;font-size:26px;font-weight:600;color:#080808;line-height:1.25;letter-spacing:-0.02em">
      Reset your password
    </h1>
    <p style="margin:0;font-family:'Inter',-apple-system,sans-serif;font-size:15px;line-height:1.6;color:#666666">
      Someone — hopefully you — asked to reset the password for <strong style="color:#080808;font-weight:500">${email}</strong>. Click below to choose a new one.
    </p>
    ${ctaButton('Choose a new password', link)}
    ${fallbackLink(link)}
    <p style="margin:32px 0 0;font-family:'Inter',-apple-system,sans-serif;font-size:12px;line-height:1.6;color:#999999">
      This link expires in 1 hour. If you didn't request a reset, you can safely ignore this email — your account is still secure.
    </p>
  `;

  await sendEmail({
    to: email,
    subject: 'Reset your Socrates password',
    text: textWrap([
      'You requested a password reset for your Socrates account.',
      `Account: ${email}`,
      'Open this link to choose a new password:',
      link,
      'This link expires in 1 hour. If you did not request a reset, ignore this email.',
    ]),
    html: shell({
      preheader: 'Pick a new password for your Socrates account.',
      title: 'Reset your Socrates password',
      body,
    }),
  });
}

/**
 * Send an 8-character login code (passwordless sign-in).
 */
export async function sendLoginCode(email: string, code: string) {
  const body = `
    <h1 style="margin:0 0 16px;font-family:'Inter',-apple-system,sans-serif;font-size:26px;font-weight:600;color:#080808;line-height:1.25;letter-spacing:-0.02em">
      Your login code
    </h1>
    <p style="margin:0 0 28px;font-family:'Inter',-apple-system,sans-serif;font-size:15px;line-height:1.6;color:#666666">
      Enter this code on the sign-in screen to access <strong style="color:#080808;font-weight:500">${email}</strong>.
    </p>

    <!-- Code rendered in a wide-tracked monospace block. JetBrains
         Mono (matches the app's --lobe code font) on a quiet hairline
         band — the only place we add a faint fill, to keep the code
         readable at 32 px without visually shouting. -->
    <div style="display:inline-block;padding:18px 22px;border:1px solid #e3e3e3;border-radius:8px;background:#fafafa;font-family:'JetBrains Mono','SF Mono',Menlo,Consolas,ui-monospace,monospace;font-size:32px;font-weight:500;color:#080808;letter-spacing:0.4em;line-height:1.2">
      ${code}
    </div>

    <p style="margin:32px 0 0;font-family:'Inter',-apple-system,sans-serif;font-size:12px;line-height:1.6;color:#999999">
      This code expires in 10 minutes. For your security, never share it with anyone.
    </p>
  `;

  await sendEmail({
    to: email,
    subject: 'Your Socrates login code',
    text: textWrap([
      'Your Socrates login code is:',
      code,
      'This code expires in 10 minutes. If you did not request this, ignore this email.',
    ]),
    html: shell({
      preheader: `Your sign-in code is ${code}.`,
      title: 'Your Socrates login code',
      body,
    }),
  });
}

/**
 * Send a duplicate-registration warning.
 *
 * Triggered when someone tries to register with an email that's
 * already on file. We intentionally do NOT reveal registration
 * state to the requester — the API still returns 200 OK with the
 * same success shape as a fresh registration — but the registered
 * owner of the email DOES get this email so they can act if it
 * wasn't them.
 */
export async function sendDuplicateRegistrationEmail(email: string) {
  const body = `
    <h1 style="margin:0 0 16px;font-family:'Inter',-apple-system,sans-serif;font-size:26px;font-weight:600;color:#080808;line-height:1.25;letter-spacing:-0.02em">
      New registration attempt
    </h1>
    <p style="margin:0 0 12px;font-family:'Inter',-apple-system,sans-serif;font-size:15px;line-height:1.6;color:#666666">
      Someone — possibly you — just tried to create a Socrates account using <strong style="color:#080808;font-weight:500">${email}</strong>. The address is already registered, so no new account was created.
    </p>
    <p style="margin:0;font-family:'Inter',-apple-system,sans-serif;font-size:15px;line-height:1.6;color:#666666">
      If this was you trying to sign back in, use the sign-in screen or request a password reset from the auth page. If this wasn't you, you can safely ignore this email — your account is still secure.
    </p>
    <p style="margin:32px 0 0;font-family:'Inter',-apple-system,sans-serif;font-size:12px;line-height:1.6;color:#999999">
      You're receiving this because your email is on a Socrates account.
    </p>
  `;

  await sendEmail({
    to: email,
    subject: 'New registration attempt on your Socrates account',
    text: textWrap([
      'Someone just tried to register with ' + email + ' on Socrates.',
      'The address is already on file, so no account was created.',
      "If this was you trying to sign back in, use the sign-in screen or request a password reset. If it wasn't you, you can safely ignore this email — your account is still secure.",
    ]),
      html: shell({
        preheader: 'A registration was attempted with your email address.',
        title: 'New registration attempt on your Socrates account',
        body,
      }),
  });
}

/**
 * Send the status-page subscription confirmation email.
 *
 * Branded for the Topodrive Status site (not the Socrates wordmark),
 * but follows the same restrained monochrome transactional language:
 * single 540px column, generous rhythm, one hairline, no card/shadow.
 * `confirmUrl` is the public status host link the subscriber clicks.
 */
export async function sendStatusSubscriptionEmail(email: string, confirmUrl: string) {
  const wordmark = 'Topodrive <span style="font-weight:400;color:#999999">Status</span>';

  const body = `
    <h1 style="margin:0 0 14px;font-family:'Inter',-apple-system,sans-serif;font-size:26px;font-weight:600;color:#080808;line-height:1.25;letter-spacing:-0.02em">
      Almost there — confirm your subscription
    </h1>
    <p style="margin:0;font-family:'Inter',-apple-system,sans-serif;font-size:15px;line-height:1.65;color:#666666">
      Thanks for subscribing to <strong style="color:#080808;font-weight:500">Topodrive Status</strong> updates. We'll email you the moment a service goes down or recovers — no noise, only when it matters.
    </p>
    ${ctaButton('Confirm subscription', confirmUrl)}
    ${fallbackLink(confirmUrl)}
    <p style="margin:36px 0 0;font-family:'Inter',-apple-system,sans-serif;font-size:12px;line-height:1.6;color:#999999">
      This confirmation link expires in 7 days. If you didn't request this subscription, you can safely ignore this email — nothing has been set up yet.
    </p>
  `;

  await sendEmail({
    to: email,
    subject: 'Confirm your Topodrive Status subscription',
    text: textWrap([
      'Thanks for subscribing to Topodrive Status updates.',
      'Please confirm your email by opening this link:',
      confirmUrl,
      'We will only email you when a service goes down or recovers.',
      'This link expires in 7 days. If you did not request this, you can ignore this email.',
    ]),
    html: statusShell({
      preheader: 'One tap to confirm your Topodrive Status alerts.',
      title: 'Confirm your Topodrive Status subscription',
      wordmark,
      body,
    }),
  });
}

/* Status-site email layout — mirrors the Socrates shell's monochrome
 * discipline but carries the Topodrive Status wordmark and links back
 * to the status page rather than the app. Palette matches the
 * Socrates shell exactly. */
function statusShell({ preheader, title, wordmark, body }: {
  preheader?: string;
  title: string;
  wordmark: string;
  body: string;
}) {
  const pre = preheader || '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>${title}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
</style>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#080808;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility">
<span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden">${pre}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff">
  <tr>
    <td align="center" style="padding:64px 16px 48px">
      <table role="presentation" width="540" cellpadding="0" cellspacing="0" border="0" style="max-width:100%;width:100%">

        <tr>
          <td align="left" style="padding:0 0 56px">
            <img src="https://app.topodrive.top/logo.png" alt="Topodrive Status" width="28" height="28" style="display:block;width:28px;height:28px;border:0;border-radius:8px" />
            <div style="margin-top:12px;font-family:'Inter',-apple-system,sans-serif;font-size:17px;font-weight:600;letter-spacing:-0.025em;color:#080808;line-height:20px">
              ${wordmark}
            </div>
          </td>
        </tr>

        <tr>
          <td style="font-size:15px;line-height:1.6;color:#666666">
            ${body}
          </td>
        </tr>

        <tr>
          <td style="padding:48px 0 0">
            <div style="height:1px;background:#e3e3e3;line-height:1px;font-size:1px">&nbsp;</div>
            <div style="padding-top:20px;font-size:12px;line-height:1.5;color:#999999;letter-spacing:-0.005em">
              <a href="https://status.topodrive.top" style="color:#999999;text-decoration:none">Topodrive Status</a> · real-time service health for Topodrive.
            </div>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

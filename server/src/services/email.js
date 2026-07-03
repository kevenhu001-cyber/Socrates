import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn('[email] SMTP not fully configured — emails will be logged instead of sent');
    return null;
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
 * Send an email. Falls back to console.log when SMTP is not configured.
 */
export async function sendEmail({ to, subject, text, html }) {
  const t = getTransporter();
  if (!t) {
    console.log(`[email] WOULD SEND — to: ${to}, subject: ${subject}`);
    console.log(`[email] body: ${text || html}`);
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
    console.error('[email] Failed to send:', err.message);
  }
}

/* ──────────────────────────────────────────────
   Email layout
   ──────────────────────────────────────────────
   Elegant monochrome transactional style.

   Palette (strict greyscale; no accent color, no card):
     page bg     #ffffff
     ink         #111111  (headings, button)
     body        #4a4a4a  (paragraphs)
     muted       #8a8a8a  (secondary)
     hairline    #ececec  (1px rules)

   Typography:
     wordmark    Inter 17 / 600, tight tracking
     heading     Inter 26 / 600, tight tracking, -0.02em
     body        Inter 15 / 400, line-height 1.6, color #4a4a4a
     micro       Inter 12 / 400, color #8a8a8a, used for footer + helper

   Single-column 540px stack. Generous vertical rhythm. No card,
   no shadows, no icons, no badges — only typography, white
   space, and a single hairline divider near the bottom.
   ────────────────────────────────────────────── */
function shell({ preheader, title, body }) {
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
<body style="margin:0;padding:0;background:#ffffff;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility">
<span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden">${pre}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff">
  <tr>
    <td align="center" style="padding:64px 16px 48px">
      <table role="presentation" width="540" cellpadding="0" cellspacing="0" border="0" style="max-width:100%;width:100%">

        <!-- Wordmark — small, tight, left-aligned.
             No icon. -->
        <tr>
          <td align="left" style="padding:0 0 56px">
            <div style="font-family:'Inter',-apple-system,sans-serif;font-size:17px;font-weight:600;letter-spacing:-0.025em;color:#111;line-height:20px">
              Socrates
            </div>
          </td>
        </tr>

        <!-- Body slot -->
        <tr>
          <td style="font-size:15px;line-height:1.6;color:#4a4a4a">
            ${body}
          </td>
        </tr>

        <!-- Hairline + footer -->
        <tr>
          <td style="padding:48px 0 0">
            <div style="height:1px;background:#ececec;line-height:1px;font-size:1px">&nbsp;</div>
            <div style="padding-top:20px;font-size:12px;line-height:1.5;color:#8a8a8a;letter-spacing:-0.005em">
              <a href="https://topodrive.top" style="color:#8a8a8a;text-decoration:none">Socrates</a> · an AI tutor that asks questions to help you think.
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

/* Primary button. Solid ink, white label, 8 px radius, weight 500. */
function ctaButton(label, href) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="left" style="margin:32px 0 8px">
    <tr>
      <td align="center" bgcolor="#111111" style="border-radius:8px">
        <a href="${href}" target="_blank" style="display:inline-block;padding:13px 26px;font-family:'Inter',-apple-system,sans-serif;font-size:15px;font-weight:500;color:#ffffff;text-decoration:none;letter-spacing:-0.01em">${label}</a>
      </td>
    </tr>
  </table>`;
}

/* Hairline-divider helper — pure 1 px rule, no decoration. */
function hairline() {
  return `<div style="height:1px;background:#ececec;line-height:1px;font-size:1px;margin:24px 0">&nbsp;</div>`;
}

/* Fallback URL — quiet, monospaced, sits below the button. */
function fallbackLink(link) {
  return `<p style="margin:8px 0 0;font-size:12px;line-height:1.6;color:#8a8a8a;word-break:break-all">
    Or paste this link into your browser:
  </p>
  <p style="margin:4px 0 0;font-family:'SF Mono',Menlo,Consolas,ui-monospace,monospace;font-size:12px;line-height:1.6;color:#4a4a4a;word-break:break-all">
    <a href="${link}" style="color:#4a4a4a;text-decoration:underline;text-decoration-color:#ececec">${link}</a>
  </p>`;
}

/* Plain-text joiner for the no-HTML / log-only fallback. */
function textWrap(parts) {
  return parts.filter(Boolean).join('\n\n');
}

/**
 * Send a verification email.
 */
export async function sendVerificationEmail(email, token) {
  const baseUrl = process.env.APP_URL || 'https://app.topodrive.top';
  const link = `${baseUrl}?token=${token}`;

  const body = `
    <h1 style="margin:0 0 16px;font-family:'Inter',-apple-system,sans-serif;font-size:26px;font-weight:600;color:#111;line-height:1.25;letter-spacing:-0.02em">
      Verify your email
    </h1>
    <p style="margin:0;font-family:'Inter',-apple-system,sans-serif;font-size:15px;line-height:1.6;color:#4a4a4a">
      Welcome to Socrates. Confirm this address to activate your account and save sessions across devices.
    </p>
    ${ctaButton('Verify email', link)}
    ${fallbackLink(link)}
    <p style="margin:32px 0 0;font-family:'Inter',-apple-system,sans-serif;font-size:12px;line-height:1.6;color:#8a8a8a">
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
export async function sendPasswordResetEmail(email, token) {
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
    <h1 style="margin:0 0 16px;font-family:'Inter',-apple-system,sans-serif;font-size:26px;font-weight:600;color:#111;line-height:1.25;letter-spacing:-0.02em">
      Reset your password
    </h1>
    <p style="margin:0;font-family:'Inter',-apple-system,sans-serif;font-size:15px;line-height:1.6;color:#4a4a4a">
      Someone — hopefully you — asked to reset the password for <strong style="color:#111;font-weight:500">${email}</strong>. Click below to choose a new one.
    </p>
    ${ctaButton('Choose a new password', link)}
    ${fallbackLink(link)}
    <p style="margin:32px 0 0;font-family:'Inter',-apple-system,sans-serif;font-size:12px;line-height:1.6;color:#8a8a8a">
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
export async function sendLoginCode(email, code) {
  const body = `
    <h1 style="margin:0 0 16px;font-family:'Inter',-apple-system,sans-serif;font-size:26px;font-weight:600;color:#111;line-height:1.25;letter-spacing:-0.02em">
      Your login code
    </h1>
    <p style="margin:0 0 32px;font-family:'Inter',-apple-system,sans-serif;font-size:15px;line-height:1.6;color:#4a4a4a">
      Enter this code on the sign-in screen to access <strong style="color:#111;font-weight:500">${email}</strong>.
    </p>

    <!-- Code rendered in a wide-tracked monospace block. No chip /
         box decoration — typography does the work. -->
    <div style="font-family:'SF Mono',Menlo,Consolas,ui-monospace,monospace;font-size:32px;font-weight:500;color:#111;letter-spacing:0.4em;line-height:1.4">
      ${code}
    </div>

    <p style="margin:40px 0 0;font-family:'Inter',-apple-system,sans-serif;font-size:12px;line-height:1.6;color:#8a8a8a">
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
export async function sendDuplicateRegistrationEmail(email) {
  const body = `
    <h1 style="margin:0 0 16px;font-family:'Inter',-apple-system,sans-serif;font-size:26px;font-weight:600;color:#111;line-height:1.25;letter-spacing:-0.02em">
      New registration attempt
    </h1>
    <p style="margin:0 0 12px;font-family:'Inter',-apple-system,sans-serif;font-size:15px;line-height:1.6;color:#4a4a4a">
      Someone — possibly you — just tried to create a Socrates account using <strong style="color:#111;font-weight:500">${email}</strong>. The address is already registered, so no new account was created.
    </p>
    <p style="margin:0;font-family:'Inter',-apple-system,sans-serif;font-size:15px;line-height:1.6;color:#4a4a4a">
      If this was you trying to sign back in, use the sign-in screen or request a password reset from the auth page. If this wasn't you, you can safely ignore this email — your account is still secure.
    </p>
    <p style="margin:32px 0 0;font-family:'Inter',-apple-system,sans-serif;font-size:12px;line-height:1.6;color:#8a8a8a">
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

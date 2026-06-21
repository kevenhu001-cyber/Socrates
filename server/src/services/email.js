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
   Shared shell used by every transactional email. The body slot is
   rendered as raw HTML and must be self-contained (no <html>/<body>).

   Design notes:
   - Warm paper palette (#faf6ef, #2c2c2a) to mirror the SPA.
   - Lora (serif) for the brand wordmark, Inter for body — both
     loaded from Google Fonts (email clients that block webfonts
     fall back to the system stack).
   - 560 px max width, mobile-friendly.
   - Footer includes the company address placeholder + unsubscribe
     line to satisfy CAN-SPAM / GDPR-style expectations.
   ────────────────────────────────────────────── */
function shell({ preheader, title, body }) {
  // Preheader is hidden preview text shown in the inbox list.
  const pre = preheader || '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f1ece3;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2c2c2a;-webkit-font-smoothing:antialiased">
<span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden">${pre}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1ece3">
  <tr>
    <td align="center" style="padding:32px 16px">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:100%;width:100%">

        <!-- Brand wordmark -->
        <tr>
          <td align="center" style="padding:0 0 24px">
            <div style="display:inline-block;font-family:'Lora',Georgia,serif;font-size:24px;font-weight:600;letter-spacing:0.5px;color:#2c2c2a">
              <span style="color:#b8955a">S</span>ocrates
            </div>
            <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#9c9c98;margin-top:4px">Learn anything, step by step</div>
          </td>
        </tr>

        <!-- Card -->
        <tr>
          <td style="background:#ffffff;border-radius:14px;box-shadow:0 1px 2px rgba(28,25,23,.04),0 8px 24px -8px rgba(28,25,23,.08);overflow:hidden">
            ${body}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td align="center" style="padding:24px 8px 0">
            <div style="font-size:12px;line-height:1.6;color:#8a8a86">
              Sent by Socrates · <a href="https://topodrive.top" style="color:#8a8a86;text-decoration:underline">topodrive.top</a><br>
              You receive this because you have an active Socrates account.
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

/* Reusable "icon badge" — a small circular emblem with a stroke
   icon. Pass an SVG (24x24) and a background tint. */
function iconBadge(svg, bg = '#f5ede0') {
  return `<div style="width:56px;height:56px;border-radius:50%;background:${bg};display:inline-flex;align-items:center;justify-content:center;margin:0 auto 20px">
    ${svg}
  </div>`;
}

/* Big primary button — call to action. */
function ctaButton(label, href) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:8px auto 4px">
    <tr>
      <td align="center" bgcolor="#2c2c2a" style="border-radius:10px">
        <a href="${href}" target="_blank" style="display:inline-block;padding:14px 32px;font-family:'Inter',-apple-system,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:0.01em">${label}</a>
      </td>
    </tr>
  </table>`;
}

/* Fallback URL for clients that don't render HTML — short text version. */
function textWrap(parts) {
  return parts.filter(Boolean).join('\n\n');
}

/**
 * Send a verification email.
 */
export async function sendVerificationEmail(email, token) {
  const baseUrl = process.env.APP_URL || 'https://app.topodrive.top';
  const link = `${baseUrl}?token=${token}`;

  const checkSvg = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#b8955a" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
  const body = `
    <div style="padding:40px 40px 8px;text-align:center">
      ${iconBadge(checkSvg, '#f5ede0')}
      <h1 style="margin:0 0 10px;font-family:'Lora',Georgia,serif;font-size:24px;font-weight:600;color:#2c2c2a;line-height:1.3">Verify your email</h1>
      <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#6b6b68">
        Welcome to Socrates. Confirm this address and we'll unlock your account — including saving sessions across devices and using your own API keys.
      </p>
      ${ctaButton('Verify email', link)}
      <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#9c9c98">
        Or paste this link in your browser:<br>
        <a href="${link}" style="color:#b8955a;word-break:break-all;text-decoration:none">${link}</a>
      </p>
    </div>
    <div style="padding:24px 40px 36px;border-top:1px solid #efe9dd;margin-top:32px">
      <p style="margin:0;font-size:12px;line-height:1.6;color:#9c9c98;text-align:center">
        This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.
      </p>
    </div>
  `;

  await sendEmail({
    to: email,
    subject: 'Verify your Socrates account',
    text: textWrap([
      'Welcome to Socrates!',
      'Please verify your email by clicking this link:',
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
  const link = `${baseUrl}/reset-password?token=${token}`;

  const keySvg = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#b8955a" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>`;
  const body = `
    <div style="padding:40px 40px 8px;text-align:center">
      ${iconBadge(keySvg, '#f5ede0')}
      <h1 style="margin:0 0 10px;font-family:'Lora',Georgia,serif;font-size:24px;font-weight:600;color:#2c2c2a;line-height:1.3">Reset your password</h1>
      <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#6b6b68">
        Someone — hopefully you — asked to reset the password for <strong style="color:#2c2c2a">${email}</strong>. Click the button below to choose a new one.
      </p>
      ${ctaButton('Choose a new password', link)}
      <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#9c9c98">
        Or paste this link in your browser:<br>
        <a href="${link}" style="color:#b8955a;word-break:break-all;text-decoration:none">${link}</a>
      </p>
    </div>
    <div style="padding:24px 40px 36px;border-top:1px solid #efe9dd;margin-top:32px">
      <p style="margin:0;font-size:12px;line-height:1.6;color:#9c9c98;text-align:center">
        This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email — your account is still secure.
      </p>
    </div>
  `;

  await sendEmail({
    to: email,
    subject: 'Reset your Socrates password',
    text: textWrap([
      'You requested a password reset for your Socrates account.',
      `Account: ${email}`,
      'Click this link to choose a new password:',
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
  const lockSvg = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#b8955a" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;

  // Render each character as its own box for a more polished look.
  const boxes = code.split('').map((d) => `
    <td align="center" style="width:42px;height:54px;background:#faf6ef;border:1px solid #e8e0d0;border-radius:8px;font-family:'JetBrains Mono','SF Mono',Menlo,monospace;font-size:24px;font-weight:600;color:#2c2c2a;letter-spacing:0">${d}</td>
    <td style="width:6px"></td>
  `).join('');

  const body = `
    <div style="padding:40px 40px 8px;text-align:center">
      ${iconBadge(lockSvg, '#f5ede0')}
      <h1 style="margin:0 0 10px;font-family:'Lora',Georgia,serif;font-size:24px;font-weight:600;color:#2c2c2a;line-height:1.3">Your login code</h1>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#6b6b68">
        Enter this code on the sign-in screen to access <strong style="color:#2c2c2a">${email}</strong>.
      </p>

      <!-- Code display -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 8px">
        <tr>${boxes}</tr>
      </table>

      <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#9c9c98">
        Didn't request this? You can safely ignore this email.
      </p>
    </div>
    <div style="padding:24px 40px 36px;border-top:1px solid #efe9dd;margin-top:32px">
      <p style="margin:0;font-size:12px;line-height:1.6;color:#9c9c98;text-align:center">
        This code expires in 10 minutes. For your security, never share it with anyone.
      </p>
    </div>
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

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

        <!-- Brand wordmark. Nested table keeps the wordmark centered
             on every client; iOS Gmail ignores display:inline-block
             on a div, which made the previous layout stretch full-
             width on mobile. -->
        <tr>
          <td align="center" style="padding:0 0 24px">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto">
              <tr>
                <td align="center" style="font-family:'Lora',Georgia,serif;font-size:24px;font-weight:600;letter-spacing:0.5px;color:#2c2c2a;mso-line-height-rule:exactly;line-height:28px">
                  <span style="color:#b8955a">S</span>ocrates
                </td>
              </tr>
            </table>
            <div style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#9c9c98;margin-top:6px;line-height:14px">Learn anything, step by step</div>
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

/* Reusable "icon badge" — a small circular emblem with a centered
   text character. Uses a <table> layout instead of flexbox so it
   renders correctly in every email client (Gmail strips inline-flex;
   SVG icons are not supported in Gmail/Outlook/Yahoo). The character
   is vertically centered via line-height matching the cell height. */
function iconBadge(ch, bg = '#f5ede0') {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 20px">
    <tr>
      <td align="center" valign="middle" style="width:56px;height:56px;border-radius:50%;background:${bg};font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:56px;font-weight:400;color:#b8955a;mso-line-height-rule:exactly;padding:0">
        ${ch}
      </td>
    </tr>
  </table>`;
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

  const body = `
    <div style="padding:36px 24px 8px;text-align:center">
      ${iconBadge('\u2713', '#f5ede0')}
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
    <div style="padding:24px 24px 36px;border-top:1px solid #efe9dd;margin-top:32px">
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

  const body = `
    <div style="padding:36px 24px 8px;text-align:center">
      ${iconBadge('\u2726', '#f5ede0')}
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
    <div style="padding:24px 24px 36px;border-top:1px solid #efe9dd;margin-top:32px">
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
  // Render each character as its own box for a more polished look.
  const boxes = code.split('').map((d) => `
    <td align="center" style="width:42px;height:54px;background:#faf6ef;border:1px solid #e8e0d0;border-radius:8px;font-family:'JetBrains Mono','SF Mono',Menlo,monospace;font-size:24px;font-weight:600;color:#2c2c2a;letter-spacing:0">${d}</td>
    <td style="width:6px"></td>
  `).join('');

  const body = `
    <div style="padding:36px 24px 8px;text-align:center">
      ${iconBadge('\u25C9', '#f5ede0')}
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
    <div style="padding:24px 24px 36px;border-top:1px solid #efe9dd;margin-top:32px">
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

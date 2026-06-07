/**
 * SMTP connectivity test — reads credentials from .env in the same directory.
 * Run: node _smtp-test.js
 *
 * NEVER hardcode passwords in this file. The real credentials live in .env
 * (which is chmod 600 and excluded from version control).
 */
const path = require('path');
const fs = require('fs');

/* Minimal .env loader (same pattern as server.js) */
(function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    console.log('No .env found at', envPath);
    return;
  }
  const txt = fs.readFileSync(envPath, 'utf8');
  txt.split('\n').forEach((line) => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const eq = line.indexOf('=');
    if (eq < 0) return;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    /* Only set if not already in process.env (allows override) */
    if (!(k in process.env)) process.env[k] = v;
  });
})();

const nodemailer = require('nodemailer');

(async () => {
  const USER = process.env.SMTP_USER || '';
  const PASS = process.env.SMTP_PASSWORD || '';

  if (!USER || !PASS) {
    console.log('SMTP_USER / SMTP_PASSWORD not found in .env — skipping test.');
    process.exit(0);
  }

  const t = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.exmail.qq.com',
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    secure: true,
    auth: { user: USER, pass: PASS },
    debug: true,
    logger: true,
  });

  try {
    await t.verify();
    console.log('--- VERIFY OK ---');
  } catch (e) {
    console.log('--- VERIFY FAIL ---', e.message);
  }
  t.close();
})();

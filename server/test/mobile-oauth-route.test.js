import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import authRouter from '../src/routes/auth.js';
import { listen } from './_http.js';

describe('mobile GitHub OAuth route', () => {
  let server;
  let previousClientId;

  before(async () => {
    previousClientId = process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_ID;
    const app = express();
    app.use('/api/auth', authRouter);
    server = await listen(app);
  });

  after(async () => {
    if (previousClientId === undefined) delete process.env.GITHUB_CLIENT_ID;
    else process.env.GITHUB_CLIENT_ID = previousClientId;
    await server.close();
  });

  test('is public and redirects back to the app when GitHub is not configured', async () => {
    const response = await fetch(
      `${server.url}/api/auth/oauth/github/mobile/start?redirect_uri=${encodeURIComponent('socrates://auth/callback')}`,
      { redirect: 'manual' },
    );

    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), 'socrates://auth/callback?error=github_not_configured');
  });
});

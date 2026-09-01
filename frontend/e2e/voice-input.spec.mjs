import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

async function installVoiceMocks(page) {
  await page.addInitScript(() => {
    window.__voiceTrackStopped = false;

    class FakeRecognition {
      constructor() {
        window.__voiceRecognition = this;
        this.active = false;
      }

      start() {
        this.active = true;
        setTimeout(() => this.onstart?.(), 0);
      }

      stop() {
        if (!this.active) return;
        this.active = false;
        setTimeout(() => {
          this.onresult?.({
            resultIndex: 0,
            results: [{ isFinal: true, 0: { transcript: 'voice test' } }],
          });
          this.onend?.();
        }, 0);
      }
    }

    class FakeAnalyser {
      constructor() {
        this.fftSize = 32;
        this.smoothingTimeConstant = 0;
      }

      getByteTimeDomainData(data) {
        for (let index = 0; index < data.length; index += 1) {
          data[index] = index % 2 === 0 ? 184 : 72;
        }
      }
    }

    class FakeAudioContext {
      constructor() {
        this.state = 'running';
      }

      createAnalyser() {
        return new FakeAnalyser();
      }

      createMediaStreamSource() {
        return { connect() {} };
      }

      close() {
        this.state = 'closed';
        return Promise.resolve();
      }
    }

    const mediaDevices = navigator.mediaDevices || {};
    mediaDevices.getUserMedia = async () => ({
      getTracks: () => [{
        stop() {
          window.__voiceTrackStopped = true;
        },
      }],
    });
    try {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: mediaDevices,
      });
    } catch (_) {}
    window.SpeechRecognition = FakeRecognition;
    window.AudioContext = FakeAudioContext;
  });
}

async function bootVoiceFixture(page, viewport) {
  await page.setViewportSize(viewport);
  await mockAuthedApp(page);
  await installVoiceMocks(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
}

async function enterChat(page) {
  await page.evaluate(() => {
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    window.stateStore.dispatch({ type: "state/set", key: "topic", value: 'Voice input check' });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: '55555555-5555-4555-8555-555555555555' });
    document.getElementById('topicSetup')?.classList.add('hidden');
    document.getElementById('mainInner')?.classList.add('hidden');
    document.getElementById('chatView')?.classList.remove('hidden');
    document.body.dataset.conversationActive = 'true';
  });
  await page.waitForTimeout(300);
}

test('incognito control is removed from the header once a conversation starts', async ({ page }) => {
  await bootVoiceFixture(page, { width: 390, height: 844 });
  const incognito = page.locator('#mobileIncognitoBtn');
  await expect(incognito).toBeVisible();
  await expect(incognito.locator('.incognito-glyph')).toHaveCount(1);
  await expect(incognito.locator('.incognito-glyph path')).toHaveCount(3);
  await expect(incognito.locator('.incognito-glyph circle')).toHaveCount(2);
  await incognito.screenshot({ path: '/tmp/socrates-incognito-redesign.png' });

  await incognito.click();
  await expect(incognito).toHaveAttribute('aria-pressed', 'true');
  await incognito.screenshot({ path: '/tmp/socrates-incognito-redesign-active.png' });
  await incognito.click();
  await expect(incognito).toHaveAttribute('aria-pressed', 'false');

  await enterChat(page);

  await expect(incognito).toBeHidden();
});

test('the empty landing primary action starts voice input and becomes send after transcription', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await bootVoiceFixture(page, { width: 390, height: 844 });
  expect(new URL(page.url()).pathname).toBe('/');
  expect(await page.title()).not.toBe('');
  await expect(page.locator('#appShell')).toBeVisible();
  await expect(page.locator('vite-error-overlay, nextjs-portal, #webpack-dev-server-client-overlay')).toHaveCount(0);

  const wrap = page.locator('#topicInputWrap');
  const primary = page.locator('#startBtn');
  const editor = page.locator('#topicComposerRoot .rich-composer-editor');
  await expect(wrap.locator('.mobile-mic-btn')).toHaveCount(0);
  await expect(primary).toHaveAttribute('aria-label', 'Voice input');
  await expect(editor).toHaveCSS('text-align', 'left');
  await expect(primary.locator('.icon-voice')).toHaveCount(1);
  await expect(primary.locator('.icon-arrow')).toHaveCount(0);

  await editor.click();
  const emptyCaret = await editor.evaluate((node) => {
    const paragraph = node.querySelector('p');
    const editorRect = node.getBoundingClientRect();
    const paragraphRect = paragraph?.getBoundingClientRect();
    const placeholder = paragraph ? getComputedStyle(paragraph, '::before') : null;
    const selection = window.getSelection();
    return {
      anchorOffset: selection?.anchorOffset ?? -1,
      editorLeft: editorRect.left,
      paragraphLeft: paragraphRect?.left ?? -1,
      paddingLeft: Number.parseFloat(getComputedStyle(node).paddingLeft),
      placeholderPosition: placeholder?.position ?? '',
      placeholderFloat: placeholder?.cssFloat ?? '',
    };
  });
  expect(emptyCaret.anchorOffset).toBe(0);
  expect(emptyCaret.paragraphLeft).toBeLessThanOrEqual(emptyCaret.editorLeft + emptyCaret.paddingLeft + 1);
  expect(emptyCaret.placeholderPosition).toBe('absolute');
  expect(emptyCaret.placeholderFloat).toBe('none');
  await page.screenshot({ path: '/tmp/socrates-composer-empty-focused.png', fullPage: true });

  await editor.pressSequentially('typed');
  await expect(primary).toHaveClass(/active/);
  await expect(primary.locator('.icon-arrow')).toHaveCount(1);
  await expect(primary.locator('.icon-voice')).toHaveCount(0);
  await page.screenshot({ path: '/tmp/socrates-composer-with-text.png', fullPage: true });
  await editor.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await editor.press('Backspace');
  await expect(primary).not.toHaveClass(/active/);
  await expect(primary.locator('.icon-voice')).toHaveCount(1);
  await expect(primary.locator('.icon-arrow')).toHaveCount(0);

  await primary.click();
  const bar = wrap.locator('.voice-recording-bar');
  await expect(wrap).toHaveClass(/voice-recording-active/);
  await expect(bar).toBeVisible();
  await expect(bar.locator('.voice-recording-wave > span')).toHaveCount(26);
  await expect(bar.locator('.voice-recording-stop')).toHaveAttribute('aria-label', 'Stop voice input');
  await expect.poll(async () => bar.getAttribute('data-voice-level')).not.toBe('0.000');

  const recordingMode = await page.evaluate(() => ({
    mode: document.documentElement.dataset.mode,
    background: getComputedStyle(document.getElementById('topicInputWrap')).backgroundColor,
  }));
  if (recordingMode.mode === 'dark') {
    const red = Number(recordingMode.background.match(/\d+/)?.[0] || 255);
    expect(red).toBeLessThan(40);
  }

  const waveform = await bar.locator('.voice-recording-wave > span').evaluateAll((nodes) => ({
    heights: nodes.map((node) => getComputedStyle(node).height),
    level: nodes[0]?.closest('.voice-recording-bar')?.dataset.voiceLevel || '',
  }));
  expect(waveform.level).not.toBe('0.000');
  expect(new Set(waveform.heights).size).toBeGreaterThan(2);
  await expect(editor).toBeHidden();

  await page.screenshot({ path: 'test-results/voice-input-mobile.png', fullPage: true });
  await bar.locator('.voice-recording-stop').click();

  await expect(wrap).not.toHaveClass(/voice-recording-active/);
  await expect(editor).toContainText('voice test');
  await expect.poll(async () => page.evaluate(() => window.__voiceTrackStopped)).toBe(true);
  await expect(primary).toHaveAttribute('aria-pressed', 'false');
  await expect(primary).toHaveAttribute('aria-label', 'Send');
  expect(consoleErrors).toEqual([]);
});

test('the empty chat primary action uses the same recording bar', async ({ page }) => {
  await bootVoiceFixture(page, { width: 390, height: 844 });
  await enterChat(page);

  const wrap = page.locator('#chatInputWrap');
  const primary = page.locator('#sendBtn');
  const editor = page.locator('#chatComposerRoot .rich-composer-editor');
  await expect(wrap).toBeVisible();
  await expect(wrap.locator('.mobile-mic-btn')).toHaveCount(0);
  await expect(primary).toHaveAttribute('aria-label', 'Voice input');
  await expect(editor).toHaveCSS('text-align', 'left');
  await expect(primary.locator('.icon-voice')).toHaveCount(1);
  await expect(primary.locator('.icon-arrow')).toHaveCount(0);

  await primary.click();
  const bar = wrap.locator('.voice-recording-bar');
  await expect(bar).toBeVisible();
  await expect(wrap).toHaveClass(/voice-recording-active/);
  await expect(wrap.locator('.chat-composer-body')).toBeHidden();
  await expect(bar.locator('.voice-recording-wave > span')).toHaveCount(26);

  await bar.locator('.voice-recording-stop').click();
  await expect(wrap).not.toHaveClass(/voice-recording-active/);
  await expect(editor).toContainText('voice test');
  await expect(primary).toHaveAttribute('aria-label', 'Send');
});

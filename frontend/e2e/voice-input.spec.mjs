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
    window.state.phase = 'chat';
    window.state.topic = 'Voice input check';
    window.state.currentSessionId = '55555555-5555-4555-8555-555555555555';
    document.getElementById('topicSetup')?.classList.add('hidden');
    document.getElementById('mainInner')?.classList.add('hidden');
    document.getElementById('chatView')?.classList.remove('hidden');
    document.body.dataset.conversationActive = 'true';
  });
  await page.waitForTimeout(300);
}

test('voice input replaces the landing composer with a live waveform and restores text', async ({ page }) => {
  await bootVoiceFixture(page, { width: 390, height: 844 });

  const wrap = page.locator('#topicInputWrap');
  const mic = wrap.locator('.mobile-mic-btn');
  const editor = page.locator('#topicComposerRoot .rich-composer-editor');
  await expect(mic).toBeVisible();

  await mic.click();
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
  await expect(mic).toHaveAttribute('aria-pressed', 'false');
});

test('voice input uses the same recording bar in the chat composer', async ({ page }) => {
  await bootVoiceFixture(page, { width: 390, height: 844 });
  await enterChat(page);

  const wrap = page.locator('#chatInputWrap');
  const mic = wrap.locator('.mobile-mic-btn');
  const editor = page.locator('#chatComposerRoot .rich-composer-editor');
  await expect(wrap).toBeVisible();
  await expect(mic).toBeVisible();

  await mic.click();
  const bar = wrap.locator('.voice-recording-bar');
  await expect(bar).toBeVisible();
  await expect(wrap).toHaveClass(/voice-recording-active/);
  await expect(wrap.locator('.chat-composer-body')).toBeHidden();
  await expect(bar.locator('.voice-recording-wave > span')).toHaveCount(26);

  await bar.locator('.voice-recording-stop').click();
  await expect(wrap).not.toHaveClass(/voice-recording-active/);
  await expect(editor).toContainText('voice test');
});

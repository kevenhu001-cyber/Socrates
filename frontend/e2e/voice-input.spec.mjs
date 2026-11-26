import { test, expect } from './_state-fixture.mjs';
import { gotoAndSettle, rgbChannels } from './_lib.mjs';
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
        /* A short flush window lets the spec observe the transcribing state
           before the final result lands. */
        setTimeout(() => {
          this.onresult?.({
            resultIndex: 0,
            results: [{ isFinal: true, 0: { transcript: 'voice test' } }],
          });
          this.onend?.();
        }, 200);
      }

      abort() {
        if (!this.active) return;
        this.active = false;
        setTimeout(() => this.onend?.(), 200);
      }
    }

    class FakeAnalyser {
      constructor() {
        this.fftSize = 512;
        this.frequencyBinCount = 256;
        this.smoothingTimeConstant = 0;
        this.context = { sampleRate: 48000 };
      }

      getByteTimeDomainData(data) {
        for (let index = 0; index < data.length; index += 1) {
          data[index] = index % 2 === 0 ? 184 : 72;
        }
      }

      getFloatFrequencyData(data) {
        for (let index = 0; index < data.length; index += 1) {
          data[index] = -80 + (index % 7) * 9;
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
      getTracks: () => [
        {
          stop() {
            window.__voiceTrackStopped = true;
          },
        },
      ],
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
    window.__socratesTestState.patch({ session: { phase: 'chat' } });
    window.__socratesTestState.patch({ session: { topic: 'Voice input check' } });
    window.__socratesTestState.patch({
      session: { currentSessionId: '55555555-5555-4555-8555-555555555555' },
    });
    window.__testActivateMainView('chatView');
    document.body.dataset.conversationActive = 'true';
  });
  await page.waitForTimeout(300);
}

test('incognito lives in the 更多 popover; new-chat stays out of the home header', async ({
  page,
}) => {
  await bootVoiceFixture(page, { width: 390, height: 844 });
  /* The home header keeps the hamburger and mode pill; new-chat is hidden
     here. Incognito moved into the sidebar's 更多 menu. */
  const newChat = page.locator('#mobileNewChatBtn');
  const incognito = page.locator('#mobileIncognitoBtn');
  await expect(newChat).toBeHidden();
  await expect(incognito).toHaveCount(0);

  await page.locator('#sidebarOpenBtn').click();
  await expect(page.locator('#sidebar')).toBeVisible();
  await page.locator('#navMore').click();
  const popover = page.locator('#moreNavPopover');
  await expect(popover).toBeVisible();
  const incognitoItem = popover.getByRole('menuitemcheckbox', { name: 'Incognito chat' });
  await expect(incognitoItem).toBeVisible();
  await expect(incognitoItem).toHaveAttribute('aria-checked', 'false');
  await incognitoItem.click();
  await expect(page.locator('body')).toHaveAttribute('data-incognito', 'true');

  /* Entering incognito resets the view, which closes the drawer —
     reopen it to toggle back off through the same menu path. */
  await page.locator('#sidebarOpenBtn').click();
  await expect(page.locator('#sidebar')).toBeVisible();
  await page.locator('#navMore').click();
  await expect(incognitoItem).toHaveAttribute('aria-checked', 'true');
  await incognitoItem.click();
  await expect(page.locator('body')).toHaveAttribute('data-incognito', 'false');

  await enterChat(page);

  /* New-chat becomes available in the active conversation header;
     incognito remains out of the header. */
  await expect(newChat).toBeVisible();
  await expect(incognito).toHaveCount(0);
});

test('the mic records inline and the phone shows the live spectrum', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await bootVoiceFixture(page, { width: 390, height: 844 });
  expect(new URL(page.url()).pathname).toBe('/');
  expect(await page.title()).not.toBe('');
  await expect(page.locator('#appShell')).toBeVisible();
  await expect(
    page.locator('vite-error-overlay, nextjs-portal, #webpack-dev-server-client-overlay'),
  ).toHaveCount(0);
  expect(await page.evaluate(() => typeof window.stopSpeechInput)).toBe('undefined');

  const wrap = page.locator('#composerInputWrap');
  const primary = page.locator('#composerPrimaryBtn');
  const editor = page.locator('#composerRoot .rich-composer-editor');
  const mic = wrap.locator('#composerMicBtn');
  await expect(mic).toHaveCount(1);
  await expect(mic).toBeVisible();
  await expect(mic).toHaveAttribute('aria-label', 'Voice input');
  /* Empty draft: the primary is the blue voice disc (2026-11-26 reference). */
  await expect(primary).toHaveAttribute('aria-label', 'Voice input');
  await expect(editor).toHaveCSS('text-align', 'left');
  await expect(primary.locator('[data-ui-icon=waveform]')).toHaveCount(1);
  await expect(primary.locator('.icon-voice')).toHaveCount(0);
  await expect(primary).toHaveAttribute('data-voice', 'true');

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
  expect(emptyCaret.paragraphLeft).toBeLessThanOrEqual(
    emptyCaret.editorLeft + emptyCaret.paddingLeft + 1,
  );
  expect(emptyCaret.placeholderPosition).toBe('absolute');
  expect(emptyCaret.placeholderFloat).toBe('none');
  await page.screenshot({
    path: 'test-results/socrates-composer-empty-focused.png',
    fullPage: true,
  });

  await editor.pressSequentially('typed');
  await expect(primary).toHaveAttribute('data-ready', 'true');
  await expect(primary).toBeEnabled();
  await page.screenshot({ path: 'test-results/socrates-composer-with-text.png', fullPage: true });
  await editor.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await editor.press('Backspace');
  expect(await primary.evaluate((button) => button.dataset.ready === 'true')).toBe(false);
  await expect(primary).toHaveAttribute('data-voice', 'true');

  await mic.click();
  await expect(mic).toHaveAttribute('data-voice-phase', 'recording');
  await expect(mic).toHaveAttribute('aria-pressed', 'true');
  await expect(mic).toHaveAttribute('aria-label', 'Stop voice input');
  await expect(wrap).toHaveClass(/voice-recording-active/);
  const spectrum = wrap.locator('.composer-voice-spectrum');
  await expect(spectrum).toBeVisible();
  await expect(spectrum.locator('span')).not.toHaveCount(0);
  await expect(editor).toBeHidden();
  await expect(primary).toBeDisabled();
  /* Phones hide the timer, as the reference does. */
  await expect(wrap.locator('[data-composer-voice-timer]')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/voice-input-mobile.png', fullPage: true });

  await mic.click();
  await expect(mic).toHaveAttribute('data-voice-phase', 'transcribing');
  await expect(mic).toHaveAttribute('aria-label', 'Cancel voice input');
  await expect(wrap).not.toHaveClass(/voice-recording-active/);
  await expect(editor).toContainText('voice test');
  await expect.poll(async () => page.evaluate(() => window.__voiceTrackStopped)).toBe(true);
  await expect(mic).toHaveAttribute('aria-pressed', 'false');
  await expect(primary).toHaveAttribute('aria-label', 'Send');
  expect(consoleErrors).toEqual([]);
});

test('desktop dictation keeps the editor and shows the recording timer', async ({ page }) => {
  await bootVoiceFixture(page, { width: 1280, height: 900 });
  const wrap = page.locator('#composerInputWrap');
  const editor = page.locator('#composerRoot .rich-composer-editor');
  const mic = wrap.locator('#composerMicBtn');

  await mic.click();
  await expect(mic).toHaveAttribute('data-voice-phase', 'recording');
  await expect(mic).toHaveAttribute('aria-label', 'Stop voice input');
  const timer = wrap.locator('[data-composer-voice-timer]');
  await expect(timer).toBeVisible();
  await expect(timer).toContainText(/Recording \d+s/);
  /* The spectrum is the phone replacement for the editor; desktop keeps
     the draft visible while it records. */
  await expect(wrap.locator('.composer-voice-spectrum')).toHaveCount(0);
  await expect(editor).toBeVisible();
  await page.screenshot({ path: 'test-results/voice-input-desktop.png', fullPage: true });

  await mic.click();
  await expect(wrap).not.toHaveClass(/voice-recording-active/);
  await expect(editor).toContainText('voice test');
  await expect(mic).toHaveAttribute('aria-pressed', 'false');
});

test('the chat mic uses the same inline recording state', async ({ page }) => {
  await bootVoiceFixture(page, { width: 390, height: 844 });
  await enterChat(page);

  const wrap = page.locator('#composerInputWrap');
  const primary = page.locator('#composerPrimaryBtn');
  const editor = page.locator('#composerRoot .rich-composer-editor');
  await expect(wrap).toBeVisible();
  const mic = wrap.locator('#composerMicBtn');
  await expect(mic).toHaveCount(1);
  await expect(mic).toHaveAttribute('aria-label', 'Voice input');
  /* Empty draft: the primary is the blue voice disc (2026-11-26 reference). */
  await expect(primary).toHaveAttribute('aria-label', 'Voice input');
  await expect(editor).toHaveCSS('text-align', 'left');
  await expect(primary.locator('[data-ui-icon=waveform]')).toHaveCount(1);
  await expect(primary.locator('.icon-voice')).toHaveCount(0);
  await expect(primary).toHaveAttribute('data-voice', 'true');

  await mic.click();
  await expect(mic).toHaveAttribute('data-voice-phase', 'recording');
  await expect(wrap).toHaveClass(/voice-recording-active/);
  await expect(wrap.locator('.composer-voice-spectrum')).toBeVisible();
  await expect(wrap.locator('.composer-editor-root')).toBeVisible();

  await mic.click();
  await expect(mic).toHaveAttribute('data-voice-phase', 'transcribing');
  await expect(wrap).not.toHaveClass(/voice-recording-active/);
  await expect(editor).toContainText('voice test');
  await expect(primary).toHaveAttribute('aria-label', 'Send');
});

test('canceling while transcribing discards the transcript and releases the mic', async ({
  page,
}) => {
  await bootVoiceFixture(page, { width: 390, height: 844 });
  const wrap = page.locator('#composerInputWrap');
  const editor = page.locator('#composerRoot .rich-composer-editor');
  const mic = wrap.locator('#composerMicBtn');

  await mic.click();
  await expect(mic).toHaveAttribute('data-voice-phase', 'recording');
  await expect(mic).toHaveAttribute('aria-pressed', 'true');

  /* First click stops the recognizer; the second click is the cancel
     affordance while its final result is still in flight. */
  await mic.click();
  await expect(mic).toHaveAttribute('data-voice-phase', 'transcribing');
  await mic.click();

  await expect(wrap).not.toHaveClass(/voice-recording-active/);
  await expect(editor).toHaveText('');
  await expect.poll(() => page.evaluate(() => window.__voiceTrackStopped)).toBe(true);
  await expect(mic).toHaveAttribute('aria-pressed', 'false');
});

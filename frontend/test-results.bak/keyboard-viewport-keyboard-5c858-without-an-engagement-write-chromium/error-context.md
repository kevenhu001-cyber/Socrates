# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: keyboard-viewport.spec.mjs >> keyboard lift starts continuous without an engagement write
- Location: e2e\keyboard-viewport.spec.mjs:183:1

# Error details

```
Error: expect(received).toBeGreaterThanOrEqual(expected)

Expected: >= 244
Received:    235
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic:
    - generic:
      - generic: Socrates
  - generic [ref=e2]:
    - complementary [ref=e3]:
      - generic [ref=e4]:
        - generic [ref=e5]:
          - generic [ref=e6]:
            - img [ref=e7]
            - generic [ref=e8]: Socrates
          - generic [ref=e9]:
            - button "Start a new chat" [ref=e10] [cursor=pointer]:
              - img [ref=e11]
            - button "Close sidebar" [ref=e13] [cursor=pointer]:
              - img [ref=e14]
        - navigation "Primary navigation" [ref=e16]:
          - button "New chat" [ref=e17] [cursor=pointer]:
            - img [ref=e19]
            - generic [ref=e20]: New chat
          - button "Library" [ref=e21] [cursor=pointer]:
            - img [ref=e23]
            - generic [ref=e26]: Library
          - button "Projects" [ref=e27] [cursor=pointer]:
            - img [ref=e29]
            - generic [ref=e31]: Projects
          - button "Scheduled" [ref=e32] [cursor=pointer]:
            - img [ref=e34]
            - generic [ref=e37]: Scheduled
          - button "Plugins" [ref=e38] [cursor=pointer]:
            - img [ref=e40]
            - generic [ref=e42]: Plugins
          - button "Customize" [ref=e43] [cursor=pointer]:
            - img [ref=e45]
            - generic [ref=e49]: Customize
        - generic [ref=e51]:
          - img [ref=e52]
          - textbox "Search chats" [ref=e55]
        - generic [ref=e56]:
          - generic [ref=e58]: Recents
          - button "All" [pressed] [ref=e60] [cursor=pointer]:
            - generic [ref=e61]: All
          - generic [ref=e64]:
            - text: No recent sessions yet.
            - text: Start a topic to begin.
        - generic [ref=e65]:
          - generic [ref=e66] [cursor=pointer]:
            - generic [ref=e67]: SM
            - generic [ref=e68]:
              - generic [ref=e69]: smoke
              - generic [ref=e71]: Diophantus
          - generic [ref=e72]:
            - button "Toggle theme" [ref=e73] [cursor=pointer]:
              - img [ref=e74]
            - button "Display settings" [ref=e76] [cursor=pointer]:
              - img [ref=e77]
        - generic "Drag to resize sidebar"
    - main [ref=e78]:
      - generic [ref=e79]:
        - tablist "Session mode" [ref=e80]:
          - tab "Chat" [selected] [ref=e81] [cursor=pointer]
          - tab "Tutor" [ref=e82] [cursor=pointer]
        - button "Expand sidebar" [ref=e84] [cursor=pointer]:
          - img [ref=e85]
        - button "Incognito chat" [ref=e87] [cursor=pointer]:
          - img [ref=e88]
      - generic [ref=e92]:
        - text: How can I help you today?
        - generic [ref=e94]:
          - button "Jump to new reply": ↓ New reply
          - generic [ref=e96]:
            - generic "Type your thinking..." [ref=e97]:
              - generic "Ask Socrates..." [active] [ref=e100]:
                - paragraph [ref=e101]: Ask Socrates...
            - generic [ref=e102]:
              - generic [ref=e103]:
                - button "Add tools and files" [ref=e104] [cursor=pointer]:
                  - img [ref=e105]
                - button "Beagle · Medium" [ref=e108] [cursor=pointer]:
                  - generic [ref=e109]: Medium
                  - img [ref=e110]
              - button "Voice input" [ref=e112] [cursor=pointer]:
                - img [ref=e113]
              - button "Voice input" [ref=e116] [cursor=pointer]:
                - img [ref=e118]
```

# Test source

```ts
  169 |      resting margin collapses into the lift as well (260 - 8 - 6). */
  170 |   expect(Math.round(start.y - samples[samples.length - 1])).toBe(246);
  171 | });
  172 | 
  173 | /* P_no-engagement-step — the lift must start continuous, with no same-frame
  174 |    16px "engagement" jump that used to read as a teleport on first paint.
  175 |    Goes through the real focus path so the JS rAF motion owns the lift
  176 |    (the CSS transition is suppressed by data-keyboard-motion="manual").
  177 |    Simulates an Android resize-mode keyboard by shrinking the viewport,
  178 |    then samples barTop at ~1 frame, ~2 frames, and once settled. The
  179 |    first sample's visible lift must stay inside the 14px resting-margin
  180 |    absorption floor (8px chat-input-bar padding + 6px chat-view margin);
  181 |    subsequent samples must be strictly monotonic; the settled lift lands
  182 |    at 246px. */
  183 | test('keyboard lift starts continuous without an engagement write', async ({ page }) => {
  184 |   await mockAuthedApp(page);
  185 |   await page.setViewportSize({ width: 390, height: 844 });
  186 |   await gotoAndSettle(page, '/');
  187 |   await waitForAppShell(page);
  188 | 
  189 |   await page.evaluate(() => {
  190 |     window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
  191 |     document.getElementById('topicSetup').classList.add('hidden');
  192 |     document.getElementById('chatView').classList.remove('hidden');
  193 |     document.documentElement.style.setProperty('--keyboard-inset', '0px');
  194 |   });
  195 | 
  196 |   const editor = page.locator('#chatComposerRoot .rich-composer-editor').first();
  197 |   await editor.focus();
  198 |   await page.waitForTimeout(420);
  199 |   const before = await page.evaluate(() => {
  200 |     const bar = document.getElementById('chatInputBar');
  201 |     return {
  202 |       barTop: bar.getBoundingClientRect().top,
  203 |       keyboardMotion: document.documentElement.dataset.keyboardMotion,
  204 |     };
  205 |   });
  206 |   expect(before.keyboardMotion).toBe('manual');
  207 | 
  208 |   /* A reduced browser viewport stands in for Android's resize-mode IME.
  209 |      The real keyboard changes innerHeight/visualViewport.height in the
  210 |      same way, while the controller freezes the 100dvh shell and animates
  211 |      its inset. */
  212 |   await page.setViewportSize({ width: 390, height: 584 });
  213 |   const samples = [];
  214 |   /* Dense early samples: rAF runs at ~16ms, so the first motion frame
  215 |      lands at ~33ms. We start sampling at 20ms (pre-motion) and step
  216 |      forward to catch the moment the motion begins, the first motion
  217 |      frame itself, and a few frames after. The tail waits long enough
  218 |      for the chase spring to settle so the final sample lands at the
  219 |      target rather than part-way up the curve. */
  220 |   for (const delay of [20, 16, 16, 16, 32, 60, 80, 240]) {
  221 |     await page.waitForTimeout(delay);
  222 |     const sample = await page.evaluate(() => {
  223 |       const bar = document.getElementById('chatInputBar');
  224 |       return {
  225 |         barTop: bar.getBoundingClientRect().top,
  226 |         inset: document.documentElement.style.getPropertyValue('--keyboard-inset'),
  227 |         transition: getComputedStyle(document.getElementById('chatView')).transitionDuration,
  228 |       };
  229 |     });
  230 |     samples.push(sample);
  231 |   }
  232 | 
  233 |   /* The critically-damped chase (~100ms smoothTime) lands a 260px target
  234 |      in ~230ms. The first non-zero inset is the rAF proving it owns the
  235 |      lift; its
  236 |      exact value depends on which frame Playwright's sample lands in
  237 |      and is intentionally not pinned (per-frame timing in test code is
  238 |      not reliable enough to catch a 1px-vs-16px regression directly).
  239 |      The hard guards against an engagement step come from the
  240 |      monotonicity + visible-lift-in-resting-margin checks below — and
  241 |      from unit coverage of the motion curve itself in test/motion.test.mjs. */
  242 |   const nonZero = samples.find((sample) => Number.parseInt(sample.inset, 10) > 0);
  243 |   expect(nonZero, 'rAF motion must start writing inset within ~100ms').toBeDefined();
  244 |   /* The first frame the composer becomes measurably above the resting
  245 |      margin (visible lift > 14px), the inset must still be a fraction of
  246 |      the target — not the whole 260px in one write. */
  247 |   const firstVisibleLift = samples.find((sample) => before.barTop - sample.barTop > 14);
  248 |   if (firstVisibleLift) {
  249 |     const firstVisibleInset = Number.parseInt(firstVisibleLift.inset, 10) || 0;
  250 |     expect(firstVisibleInset).toBeLessThan(260);
  251 |     expect(firstVisibleInset).toBeGreaterThan(14);
  252 |   }
  253 | 
  254 |   /* Strictly monotonic — each subsequent frame must not have moved
  255 |      further than the previous one, and never reversed. */
  256 |   for (let index = 1; index < samples.length; index += 1) {
  257 |     expect(samples[index].barTop).toBeLessThanOrEqual(samples[index - 1].barTop + 1);
  258 |   }
  259 |   /* The CSS transition must be off — data-keyboard-motion="manual"
  260 |      suppresses it so the rAF motion owns the lift and does not fight
  261 |      a parallel CSS interpolation. */
  262 |   expect(samples.at(-1).transition).toBe('0s');
  263 |   /* Settled displacement: viewport shrank by 260px (844→584), and the
  264 |      same 14px resting-margin absorption as in the static test applies.
  265 |      The spring's smoothTime is tuned to keep the chase visibly inside
  266 |      the platform IME window, so the absolute settled value carries up
  267 |      to ±2px of test-side timing slack. The monotonicity + visible-lift
  268 |      guards above still pin the shape of the curve. */
> 269 |   expect(Math.round(before.barTop - samples.at(-1).barTop)).toBeGreaterThanOrEqual(244);
      |                                                             ^ Error: expect(received).toBeGreaterThanOrEqual(expected)
  270 |   expect(Math.round(before.barTop - samples.at(-1).barTop)).toBeLessThanOrEqual(248);
  271 | });
  272 | 
  273 | test('resize-mode keyboard uses JS compensation before the shell reaches its target height', async ({ page }) => {
  274 |   await mockAuthedApp(page);
  275 |   await page.setViewportSize({ width: 390, height: 844 });
  276 |   await gotoAndSettle(page, '/');
  277 |   await waitForAppShell(page);
  278 | 
  279 |   await page.evaluate(() => {
  280 |     window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
  281 |     document.getElementById('topicSetup').classList.add('hidden');
  282 |     document.getElementById('chatView').classList.remove('hidden');
  283 |   });
  284 | 
  285 |   const editor = page.locator('#chatComposerRoot .rich-composer-editor').first();
  286 |   await editor.focus();
  287 |   await page.waitForTimeout(420);
  288 |   const before = await page.evaluate(() => {
  289 |     const shell = document.getElementById('appShell');
  290 |     const bar = document.getElementById('chatInputBar');
  291 |     return {
  292 |       shellHeight: shell.getBoundingClientRect().height,
  293 |       barTop: bar.getBoundingClientRect().top,
  294 |       keyboardMotion: document.documentElement.dataset.keyboardMotion,
  295 |     };
  296 |   });
  297 |   expect(before.keyboardMotion).toBe('manual');
  298 | 
  299 |   /* A reduced browser viewport stands in for Android's resize-mode IME. The
  300 |      real keyboard changes innerHeight/visualViewport.height in the same way,
  301 |      while the controller freezes the 100dvh shell and animates its inset. */
  302 |   await page.setViewportSize({ width: 390, height: 584 });
  303 |   const samples = [];
  304 |   for (const delay of [20, 30, 40, 60, 120, 180]) {
  305 |     await page.waitForTimeout(delay);
  306 |     samples.push(await page.evaluate(() => {
  307 |       const shell = document.getElementById('appShell');
  308 |       const bar = document.getElementById('chatInputBar');
  309 |       return {
  310 |         shellHeight: shell.getBoundingClientRect().height,
  311 |         barTop: bar.getBoundingClientRect().top,
  312 |         inset: document.documentElement.style.getPropertyValue('--keyboard-inset'),
  313 |         transition: getComputedStyle(document.getElementById('chatView')).transitionDuration,
  314 |       };
  315 |     }));
  316 |   }
  317 | 
  318 |   expect(samples[0].shellHeight).toBeCloseTo(before.shellHeight, 0);
  319 |   /* The JS controller must write a non-zero inset within the first sample
  320 |      — that is the proof of JS compensation, not the visible lift on
  321 |      barTop. With the critically-damped chase the first motion frame is
  322 |      ≈15px (~16ms in), which the 14px resting-margin absorption floor
  323 |      still hides almost completely, so
  324 |      barTop may not have moved visibly yet at the 20ms mark — but the
  325 |      inset variable itself must already be progressing. A ±3px slack
  326 |      on barTop covers sub-pixel jitter in the shell's frozen-height
  327 |      measurement when the viewport shrinks (the shell re-measures with
  328 |      slightly different sub-pixel rounding after the viewport change). */
  329 |   expect(Number.parseInt(samples[0].inset, 10) || 0, 'JS compensation must write a non-zero inset on the first sample').toBeGreaterThan(0);
  330 |   expect(samples[0].barTop).toBeLessThanOrEqual(before.barTop + 3);
  331 |   for (let index = 1; index < samples.length; index += 1) {
  332 |     expect(samples[index].barTop).toBeLessThanOrEqual(samples[index - 1].barTop + 1);
  333 |   }
  334 |   /* The spring's tuned smoothTime keeps the chase visibly inside the
  335 |      platform IME window, so the final sample at +450ms lands within
  336 |      ±3px of the 260px target depending on test-side frame timing. The
  337 |      shape of the curve is the property under test, not the absolute
  338 |      final pixel. */
  339 |   const finalInset = Number.parseFloat(samples.at(-1).inset);
  340 |   expect(finalInset).toBeGreaterThanOrEqual(257);
  341 |   expect(finalInset).toBeLessThanOrEqual(260);
  342 |   expect(samples.at(-1).transition).toBe('0s');
  343 | });
  344 | 
  345 | test('a second input line expands the mobile composer and keeps the latest message unobscured', async ({ page }) => {
  346 |   await mockAuthedApp(page);
  347 |   await page.setViewportSize({ width: 390, height: 844 });
  348 |   await gotoAndSettle(page, '/');
  349 |   await waitForAppShell(page);
  350 | 
  351 |   await page.evaluate(() => {
  352 |     window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
  353 |     document.getElementById('topicSetup').classList.add('hidden');
  354 |     document.getElementById('chatView').classList.remove('hidden');
  355 |     for (let index = 0; index < 18; index += 1) {
  356 |       window.addMessage(
  357 |         'assistant',
  358 |         `Pinned reply ${index + 1}: the complete line must stay above the expanding composer.`,
  359 |       );
  360 |     }
  361 |   });
  362 |   await expect(page.locator('#msgList')).toContainText('Pinned reply 18');
  363 | 
  364 |   const before = await page.evaluate(() => {
  365 |     const list = document.getElementById('msgList');
  366 |     const bar = document.getElementById('chatInputBar');
  367 |     list.scrollTop = list.scrollHeight;
  368 |     window.stateStore.dispatch({ type: "state/set", key: "_userScrolledAway", value: false });
  369 |     return { barHeight: bar.getBoundingClientRect().height };
```
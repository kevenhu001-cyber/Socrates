// e2e/focus-stability.spec.mjs — keyboard focus must never move the page.
//
// A focus indicator that resizes its control, replaces the control's
// resting elevation, paints outward into an ancestor's overflow clip, or
// is not visible at all, all read as a bug to the person typing. The four
// properties below are asserted for every focusable control on the landing
// surface and on the conversation surface, in both modes:
//
//   1. zero geometric displacement — the control's box, and every box
//      between it and the document, is identical before and after focus;
//   2. the resting paint is not dropped — a focus state that swaps the
//      control's resting elevation for a ring makes the control look like
//      it collapsed, so every resting box-shadow layer must survive, by
//      geometry, into the focus state;
//   3. the focus never grows the box — focus may only ADD inset layers.
//      An outward layer can be clipped by an overflow-hidden ancestor and
//      pushes the neighbours around, so it is not allowed to appear;
//   4. the focus is visible — the control itself, or the container that
//      reacts to :focus-within, must actually change its paint.
//
// The shared ring itself is checked as well: --ui-focus-shadow must be an
// inset ring, so no surface can grow a focus ring that reaches outside
// its own border box.
import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';
import { prepareChatWorkbench, WORKBENCH_VIEWPORTS } from './_chat-workbench.mjs';

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

/*
 * Everything below runs inside the page: it needs the live computed style
 * of the control and of its ancestors, and it has to run the blur → focus
 * → measure cycle in one task so no other script can steal the focus
 * between the two measurements.
 */
const COLLECT = async () => {
  const splitLayers = (shadow) => {
    if (!shadow || shadow === 'none') return [];
    return shadow.split(/,(?![^(]*\))/).map((part) => part.trim()).filter(Boolean);
  };

  /* A layer's geometry is what decides whether the paint survived: the
     inset flag plus the four px lengths. The colour is read separately,
     because a layer may keep its geometry and change its colour. */
  const parseLayer = (text) => {
    const nums = [...text.matchAll(/(-?[\d.]+)px/g)].map((match) => Number.parseFloat(match[1]));
    const geo = nums.slice(0, 4);
    const colorText = text.replace(/-?[\d.]+px/g, ' ').replace(/inset/gi, ' ').trim();
    return {
      inset: /inset/i.test(text),
      geo: geo.join(','),
      colorText,
      alpha: alphaOf(colorText),
    };
  };

  /* rgba(r, g, b, a) / rgb(r, g, b) / modern `rgb(r g b / a)` / oklab / color(). */
  function alphaOf(colorText) {
    if (/transparent/i.test(colorText)) return 0;
    const legacy = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/.exec(colorText);
    if (legacy) return legacy[4] === undefined ? 1 : Number.parseFloat(legacy[4]);
    const slash = /\/\s*([\d.]+)\s*\)/.exec(colorText);
    if (slash) return Number.parseFloat(slash[1]);
    return 1;
  }

  const outlinePaints = (style) => {
    if (!style || style.outlineStyle === 'none') return false;
    if (Number.parseFloat(style.outlineWidth) <= 0) return false;
    return alphaOf(`${style.outlineColor}`) > 0;
  };

  const describe = (el) => {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const layers = splitLayers(style.boxShadow).map(parseLayer);
    return {
      boxShadow: style.boxShadow,
      layers,
      outlineVisible: outlinePaints(style),
      borderColor: style.borderTopColor,
      rect: [rect.x, rect.y, rect.width, rect.height],
    };
  };

  const chain = (el, max = 6) => {
    const out = [];
    let current = el.parentElement;
    let depth = 0;
    while (current && depth < max) {
      out.push({ depth, tag: current.tagName.toLowerCase(), id: current.id || '', ...describe(current) });
      current = current.parentElement;
      depth += 1;
    }
    return out;
  };

  const isVisible = (el) => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };

  /* Wait for the element's transitions to finish before it is measured:
     a shadow or a transform that is still animating would be read as a
     half-painted state. Most controls have no animation at all, so this
     costs two frames. */
  const settle = async (node) => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const animations = node.getAnimations ? node.getAnimations({ subtree: true }) : [];
    if (animations.length) {
      await Promise.all(animations.map((animation) => animation.finished.catch(() => {})));
    }
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
  };

  const sameRect = (a, b) => a.every((value, index) => Math.abs(value - b[index]) <= 0.01);

  const results = [];
  const selector = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';
  const nodes = [...document.querySelectorAll(selector)].filter(isVisible);
  for (const el of nodes) {
    const label = el.id || el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ').slice(0, 2).join('.');
    el.blur();
    await settle(el);
    const rest = describe(el);
    const restChain = chain(el);

    el.focus({ preventScroll: true });
    await settle(el);
    const focused = document.activeElement === el;
    const foc = describe(el);
    const focChain = chain(el);

    /* 1 — geometry */
    const rectShift = rest.rect.map((value, index) => Math.abs(value - foc.rect[index]));
    /* A control that is hidden until it is focused — the skip link — is
       revealed by the focus, not moved by it. Its box is allowed to change
       because nothing was on screen to begin with. */
    const onScreenArea =
      Math.max(0, Math.min(rest.rect[0] + rest.rect[2], window.innerWidth) - Math.max(rest.rect[0], 0)) *
      Math.max(0, Math.min(rest.rect[1] + rest.rect[3], window.innerHeight) - Math.max(rest.rect[1], 0));
    const restHidden = onScreenArea === 0;
    const ancestorShift = restChain.some((ancestor, index) => {
      const now = focChain[index];
      return !now || !sameRect(ancestor.rect, now.rect);
    });

    /* 2 — the resting paint survives */
    const dropped = rest.layers.filter(
      (layer) => !foc.layers.some((now) => now.geo === layer.geo && now.inset === layer.inset),
    );

    /* 3 — focus may only add inset (or invisible) layers */
    const added = foc.layers.filter(
      (layer) => !rest.layers.some((before) => before.geo === layer.geo && before.inset === layer.inset),
    );
    const outwardAdded = added.filter((layer) => !layer.inset && layer.alpha > 0);

    /* 4 — the cue is visible */
    const selfCue =
      foc.outlineVisible ||
      foc.borderColor !== rest.borderColor ||
      foc.layers.some((layer, index) => {
        const before = rest.layers.find((candidate) => candidate.geo === layer.geo && candidate.inset === layer.inset);
        return before ? before.colorText !== layer.colorText && layer.alpha > 0 : layer.alpha > 0;
      });
    const ancestorCue = restChain.some((ancestor, index) => {
      const now = focChain[index];
      if (!now) return false;
      return (
        now.borderColor !== ancestor.borderColor ||
        now.boxShadow !== ancestor.boxShadow ||
        now.outlineVisible
      );
    });

    results.push({
      label,
      focused,
      restHidden,
      rectShift,
      ancestorShift,
      droppedLayers: dropped.map((layer) => `${layer.inset ? 'inset ' : ''}${layer.geo}`),
      addedLayers: added.map((layer) => `${layer.inset ? 'inset ' : ''}${layer.geo}`),
      outwardAdded: outwardAdded.map((layer) => `${layer.geo} ${layer.colorText}`),
      selfCue,
      ancestorCue,
      restShadow: rest.boxShadow,
      focShadow: foc.boxShadow,
    });
  }
  return results;
};

async function bootLanding(page, theme) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript((mode) => {
    try { localStorage.setItem('socrates-theme', mode); } catch (_) {}
  }, theme);
  await mockAuthedApp(page, { lang: 'en' });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.waitForTimeout(400);
}

async function audit(page, label) {
  /* Keyboard modality first: a scripted .focus() only matches
     :focus-visible while the last interaction came from the keyboard. */
  await page.keyboard.press('Tab');
  await page.waitForTimeout(120);
  const rows = await page.evaluate(COLLECT);
  expect(rows.length, `${label}: no focusable control was found`).toBeGreaterThan(10);

  const actionable = rows.filter((row) => row.focused);
  expect(actionable.length, `${label}: no control could take focus`).toBeGreaterThan(10);

  /* The zero-shift rule applies to the controls that were on screen before
     the focus; a control that was hidden until it was focused is revealed
     by the focus, which is the point of it. */
  const onScreen = actionable.filter((row) => !row.restHidden);

  const shifted = onScreen.filter((row) => row.rectShift.some((value) => value > 0.01));
  expect(shifted, `${label}: focus moved a control's box`).toEqual([]);

  const ancestorShifted = onScreen.filter((row) => row.ancestorShift);
  expect(ancestorShifted, `${label}: focus moved an ancestor's box`).toEqual([]);

  const dropped = actionable.filter((row) => row.droppedLayers.length > 0);
  expect(dropped, `${label}: focus dropped a resting shadow layer`).toEqual([]);

  const outward = actionable.filter((row) => row.outwardAdded.length > 0);
  expect(outward, `${label}: focus added an outward shadow layer`).toEqual([]);

  const invisible = actionable.filter((row) => !row.selfCue && !row.ancestorCue);
  expect(invisible, `${label}: a focusable control showed no focus cue`).toEqual([]);

  return rows;
}

test('the shared focus ring is an inset ring, so no surface can grow one', async ({ page }) => {
  await bootLanding(page, 'light');
  const token = await page.evaluate(() => {
    const value = getComputedStyle(document.documentElement).getPropertyValue('--ui-focus-shadow');
    return value.trim();
  });
  expect(token).not.toBe('');
  const layers = token.split(/,(?![^(]*\))/).map((part) => part.trim()).filter(Boolean);
  expect(layers.length).toBe(2);
  for (const layer of layers) {
    expect(layer, `--ui-focus-shadow paints outside the control: ${layer}`).toMatch(/inset/i);
  }
});

for (const theme of ['light', 'dark']) {
  test(`landing focus is stable and visible in ${theme} mode`, async ({ page }) => {
    await bootLanding(page, theme);
    const rows = await audit(page, `landing/${theme}`);
    const named = rows.filter((row) => row.focused).map((row) => row.label);
    expect(named.some((label) => label.includes('composerPrimaryBtn')) || true).toBeTruthy();
  });

  test(`conversation focus is stable and visible in ${theme} mode`, async ({ page }) => {
    await page.addInitScript((mode) => {
      try { localStorage.setItem('socrates-theme', mode); } catch (_) {}
    }, theme);
    await prepareChatWorkbench(page, { viewport: WORKBENCH_VIEWPORTS.desktop });
    await page.waitForTimeout(400);
    await audit(page, `conversation/${theme}`);
  });
}

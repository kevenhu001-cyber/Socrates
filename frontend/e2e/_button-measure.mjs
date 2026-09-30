// e2e/_button-measure.mjs — shared helpers for measuring button geometry
// and computed-style values used by mobile-button-consistency.spec.mjs
// and any future utility-class audit.

/** Return the bounding box of every matched element, in CSS px. */
export async function measureBoxes(page, selector) {
  return await page.evaluate((sel) => {
    const nodes = Array.from(document.querySelectorAll(sel));
    return nodes.map((n) => {
      const r = n.getBoundingClientRect();
      return {
        selector: sel,
        x: r.x, y: r.y,
        width: r.width, height: r.height,
        bottom: r.bottom,
      };
    });
  }, selector);
}

/** Read a computed style for a single element; returns null if absent. */
export async function readComputed(page, selector, property) {
  return await page.evaluate(({ sel, prop }) => {
    const node = document.querySelector(sel);
    if (!node) return null;
    return getComputedStyle(node).getPropertyValue(prop).trim();
  }, { sel: selector, prop: property });
}

/** Token helper: resolve a CSS custom property on the documentElement. */
export async function readToken(page, varName) {
  return await page.evaluate((name) => {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }, varName);
}

/**
 * Assert that every match of `selector` has width and height >= `floor`
 * (default 44, the WCAG/Apple-HIG mobile tap-target minimum). Logs all
 * offenders so a regression points to the exact element.
 *
 * Matches that are not currently rendered (zero-sized, detached from
 * layout) are skipped — selectors like `#mobileIncognitoBtn` and
 * `#sidebarCloseBtn` only exist when the sidebar is in a particular
 * state, and a regression on the wrong surface shouldn't fail this
 * check.
 */
export async function assertTouchTargets(page, selector, floor = 44) {
  const boxes = await measureBoxes(page, selector);
  const rendered = boxes.filter((b) => b.width > 0 || b.height > 0);
  const offenders = rendered.filter((b) => b.width < floor || b.height < floor);
  return { boxes: rendered, offenders, floor };
}

/**
 * Assert that the sidebar drawer width equals the --ui-sidebar-mobile
 * token (default 350). Resolves the value from the live CSS variable
 * instead of hardcoding it so a future token change auto-follows.
 */
export async function assertSidebarDrawerWidth(page) {
  const tokenValue = await readToken(page, '--ui-sidebar-mobile');
  const expectedPx = parseInt(tokenValue, 10);
  const boxes = await measureBoxes(page, '#appShell .sidebar');
  return { token: tokenValue, expected: expectedPx, boxes };
}
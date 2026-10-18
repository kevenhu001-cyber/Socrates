import { expect, test } from '@playwright/test';
import { prepareChatWorkbench, WORKBENCH_VIEWPORTS } from './_chat-workbench.mjs';

const PROGRAM = `root = Col([Title("A day in Paris", "lg"), map, Text("Selected: " + $place), image])
$place = ""
map = Map([MapMarker("Eiffel Tower", 48.8584, 2.2945, "Landmarks"), MapMarker("Louvre", 48.8606, 2.3376, "Museums"), MapMarker("Notre Dame", null, null, "Landmarks", null, "Notre Dame Paris France")], true, $place, 340)
image = SearchImage("Eiffel Tower Paris", 1.8)`;
const message = { clientId: 'openui-media', role: 'assistant', type: 'assistant', rawText: `Your itinerary:\n\n\`\`\`openui\n${PROGRAM}\n\`\`\`\nExplore each stop.`, html: '<p>Your itinerary:</p>' };
const IMAGE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWz8AAAAASUVORK5CYII=', 'base64');

async function mediaRoutes(page, { failImages = false, failRoute = false, failTiles = false } = {}) {
  let imageCalls = 0;
  const requested = [];
  await page.route('**/api/v2/intelligent-ui/**', async (route) => {
    const url = new URL(route.request().url()); requested.push(url);
    const json = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    if (url.pathname.endsWith('/images')) {
      imageCalls++;
      if (failImages && imageCalls === 1) return route.fulfill({ status: 502, body: '{}' });
      return json({ images: [{ url: '/api/v2/intelligent-ui/image?url=fixture-one', title: 'Eiffel Tower, Paris', sourceUrl: 'https://source.example.test/photo-one', author: 'Photo author', license: 'CC BY-SA 4.0' }, { url: '/api/v2/intelligent-ui/image?url=fixture-two', title: 'The tower at sunset', sourceUrl: 'https://source.example.test/photo-two' }] });
    }
    if (url.pathname.endsWith('/image')) return route.fulfill({ contentType: 'image/png', body: IMAGE });
    if (url.pathname.endsWith('/places')) return json({ places: [{ label: 'Notre Dame, Paris, France', lat: 48.853, lng: 2.3499, sourceUrl: 'https://www.openstreetmap.org/way/201611261' }] });
    if (url.pathname.endsWith('/route')) return failRoute ? route.fulfill({ status: 502, body: '{}' }) : json({ points: [[2.2945,48.8584],[2.3376,48.8606],[2.3499,48.853]], profile: 'driving', distance: 8400, duration: 1100 });
    if (url.pathname.endsWith('/maps/planet')) return json({ tilejson: '3.0.0', tiles: ['/api/v2/intelligent-ui/maps/tiles/fixture/{z}/{x}/{y}.pbf'], minzoom: 0, maxzoom: 14 });
    if (url.pathname.includes('/maps/tiles/')) return failTiles ? route.fulfill({ status: 502, body: '{}' }) : route.fulfill({ contentType: 'application/x-protobuf', body: Buffer.alloc(0) });
    if (url.pathname.includes('/maps/fonts/')) return route.fulfill({ contentType: 'application/x-protobuf', body: Buffer.alloc(0) });
    return route.fulfill({ status: 404 });
  });
  return requested;
}

for (const mode of ['desktop', 'mobile']) {
  test(`map selection, category filter, route and attributed image paging (${mode})`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('socrates-theme', 'light'));
    await prepareChatWorkbench(page, { messages: [], viewport: WORKBENCH_VIEWPORTS[mode] });
    const requested = await mediaRoutes(page);
    await page.evaluate((message) => {
      window.stateStore.dispatch({ type: 'state/set', key: 'messages', value: [message] });
      window.__socratesReactChatBridge?.publish({ type: 'state-synced', reason: 'media-fixture' });
    }, message);
    const map = page.locator('.iui-map');
    await expect(map).toHaveAttribute('data-map-ready', 'true');
    await expect(map).toHaveAttribute('data-route-state', 'ready');
    await expect(map.locator('canvas')).toBeVisible();
    await expect(map.locator('.iui-map-pin')).toHaveCount(3);
    await map.locator('.iui-map-pin').filter({ hasText: '1' }).click();
    await expect(page.locator('.intui-openui')).toContainText('Selected: Eiffel Tower');
    await map.getByRole('combobox', { name: 'Filter places' }).selectOption('Museums');
    await expect(map.locator('.iui-map-pin')).toHaveCount(1);
    await expect(map.locator('.iui-map-places')).not.toContainText('Eiffel Tower');
    await map.getByRole('combobox', { name: 'Filter places' }).selectOption('');
    await expect(map.locator('.iui-map-pin')).toHaveCount(3);
    const photo = page.locator('.iui-search-image');
    await expect(photo.getByRole('img')).toHaveAttribute('src', '/api/v2/intelligent-ui/image?url=fixture-one');
    await expect(photo).toContainText('CC BY-SA 4.0');
    await photo.getByRole('button', { name: 'Next image' }).click();
    await expect(photo.getByRole('img')).toHaveAttribute('alt', 'The tower at sunset');
    await expect(photo.getByRole('link')).toHaveAttribute('href', 'https://source.example.test/photo-two');
    expect(requested.some((url) => url.pathname.includes('/maps/tiles/'))).toBe(true);
    expect(requested.some((url) => url.pathname.endsWith('/places') && url.searchParams.get('q') === 'Notre Dame Paris France')).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
    await map.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/openui-media-${encodeURIComponent(mode)}.png`, fullPage: true });
  });
}

test('image requests retry, failed maps keep usable place controls, and no false route is drawn', async ({ page }) => {
  await prepareChatWorkbench(page);
  await mediaRoutes(page, { failImages: true, failRoute: true, failTiles: true });
  await page.evaluate((message) => {
    window.stateStore.dispatch({ type: 'state/set', key: 'messages', value: [message] });
    window.__socratesReactChatBridge?.publish({ type: 'state-synced', reason: 'media-failure-fixture' });
  }, message);
  const map = page.locator('.iui-map');
  await expect(map).toHaveAttribute('data-route-state', 'error');
  await expect(map).toContainText('Street routing is unavailable');
  await map.locator('.iui-map-places').getByRole('button', { name: 'Louvre', exact: true }).click();
  await expect(page.locator('.intui-openui')).toContainText('Selected: Louvre');
  const photo = page.locator('.iui-search-image');
  await expect(photo).toContainText('Images are temporarily unavailable.');
  await photo.getByRole('button', { name: 'Try again' }).click();
  await expect(photo.getByRole('img')).toBeVisible();
});

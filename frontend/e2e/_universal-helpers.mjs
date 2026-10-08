// Sidebar starts expanded on desktop and collapsed on phones. Tests should
// wait for the desired state instead of assuming the same toggle exists on
// every viewport.
export async function ensureSidebarOpen(page) {
  const close = page.getByRole('button', { name: 'Close sidebar', exact: true });
  if (await close.isVisible().catch(() => false)) return;

  const toggle = page.getByRole('button', { name: 'Toggle sidebar', exact: true });
  // After reload the app shell can be between auth restore and sidebar mount.
  // Wait for either viewport state before clicking; otherwise a missing toggle
  // turns an ordinary hydration delay into Playwright's full test timeout.
  const state = await Promise.race([
    close.waitFor({ state: 'visible', timeout: 20_000 }).then(() => 'open', () => null),
    toggle.waitFor({ state: 'visible', timeout: 20_000 }).then(() => 'closed', () => null),
  ]);
  if (state === 'open') return;
  if (state !== 'closed') throw new Error('Sidebar did not mount in either viewport state');
  await toggle.click();
  await close.waitFor({ state: 'visible', timeout: 10_000 });
}

export async function closeSidebarIfOpen(page) {
  const close = page.getByRole('button', { name: 'Close sidebar', exact: true });
  if (await close.isVisible().catch(() => false)) await close.click();
}

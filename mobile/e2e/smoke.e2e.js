describe('Socrates Android authentication shell', () => {
  beforeAll(async () => { await device.launchApp({ newInstance: true }); });

  it('opens the current sign-in shell', async () => {
    await expect(element(by.id('auth-email-input'))).toBeVisible();
    await expect(element(by.id('auth-sign-in-button'))).toBeVisible();
  });
});

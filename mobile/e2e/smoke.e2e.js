describe('Socrates Android shell', () => {
  beforeAll(async () => { await device.launchApp({ newInstance: true }); });

  it('opens the minimal sign-in shell', async () => {
    await expect(element(by.text('SOCRATES'))).toBeVisible();
    await expect(element(by.text('Continue'))).toBeVisible();
  });
});

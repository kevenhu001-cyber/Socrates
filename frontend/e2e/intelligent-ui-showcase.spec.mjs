import { expect, test } from '@playwright/test';

import { prepareChatWorkbench } from './_chat-workbench.mjs';

const SHOWCASE_SOURCE = [
  'Native Intelligent UI v2 showcase.',
  '',
  '```socrates-ui',
  '{"id":"showcase","type":"panel","title":"Intelligent UI","description":"Trusted native components rendered from the streaming JSONL contract."}',
  '{"id":"trend","type":"chart","parent":"showcase","title":"Weekly activity","kind":"bar","points":[{"label":"Mon","value":12},{"label":"Tue","value":19},{"label":"Wed","value":8}]}',
  '{"id":"views","type":"tabs","parent":"showcase","label":"Showcase views","tabs":[{"id":"overview","label":"Overview"},{"id":"details","label":"Details"}]}',
  '{"id":"overview-copy","type":"text","parent":"views","tab":"overview","text":"Overview content"}',
  '{"id":"details-copy","type":"text","parent":"views","tab":"details","text":"Details content"}',
  '{"id":"result","type":"entity","parent":"showcase","title":"Socrates Runtime","subtitle":"Native renderer","description":"Structured data stays inside the trusted component registry.","image":"https://assets.example.test/entity.svg","imageAlt":"Abstract Socrates mark","fields":[{"label":"Mode","value":"Streaming"},{"label":"Execution","value":"Declarative"}]}',
  '{"id":"gallery","type":"image-gallery","parent":"showcase","label":"References","columns":2,"images":[{"src":"https://assets.example.test/one.svg","alt":"Reference one","caption":"First reference"},{"src":"https://assets.example.test/two.svg","alt":"Reference two","caption":"Second reference"},{"src":"javascript:alert(1)","alt":"Rejected image"}]}',
  '```',
].join('\n');

const ASSISTANT_MESSAGE = {
  clientId: 'intelligent-ui-showcase',
  role: 'assistant',
  rawText: SHOWCASE_SOURCE,
  html: '<p>Native Intelligent UI v2 showcase.</p>',
  type: 'assistant',
};

test('v2 Intelligent UI showcase renders trusted components and local tab state', async ({ page }) => {
  await page.route('https://assets.example.test/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30" fill="#888"/></svg>',
    });
  });

  await prepareChatWorkbench(page, { messages: [ASSISTANT_MESSAGE] });

  const ui = page.locator('.intui');
  await expect(ui).toBeVisible();
  await expect(ui.locator('.intui-chart')).toBeVisible();
  await expect(ui.locator('.intui-chart-bar')).toHaveCount(3);

  const tabs = ui.locator('.intui-tabs');
  await expect(tabs.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.getByText('Overview content')).toBeVisible();
  await expect(tabs.getByText('Details content')).toHaveCount(0);
  await tabs.getByRole('tab', { name: 'Details' }).click();
  await expect(tabs.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.getByText('Details content')).toBeVisible();
  await expect(tabs.getByText('Overview content')).toHaveCount(0);

  const entity = ui.locator('.intui-entity');
  await expect(entity.getByText('Socrates Runtime')).toBeVisible();
  await expect(entity.getByText('Declarative')).toBeVisible();
  await expect(entity.locator('img')).toHaveAttribute('referrerpolicy', 'no-referrer');

  const gallery = ui.locator('.intui-image-gallery');
  await expect(gallery.locator('img')).toHaveCount(2);
  await expect(gallery.locator('img').first()).toHaveAttribute('loading', 'lazy');
  await expect(gallery.locator('img').first()).toHaveAttribute('referrerpolicy', 'no-referrer');
  await expect(ui).not.toContainText('Rejected image');
});

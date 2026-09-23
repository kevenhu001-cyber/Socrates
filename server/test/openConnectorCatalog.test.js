import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OPEN_CONNECTOR_APP_INVENTORY,
  READY_CONNECTOR_APPS,
} from '../src/services/openConnectorAppInventory.js';
import {
  OPEN_CONNECTOR_CLOUD_AUTH,
} from '../src/services/openConnectorCloudAuth.generated.js';
import {
  buildOpenConnectorCatalogForCloud,
  buildOpenConnectorCatalogItems,
  buildOpenConnectorCatalogWithFallback,
  ocAuthType,
  ocCatalogItem,
  ocCredentialInput,
  ocInventoryEntry,
  ocOAuthAppForm,
  ocStubCatalogItem,
} from '../src/services/openConnectorCatalog.js';
import { connectionNameForUser, parseSidecarError } from '../src/services/openConnectorSidecar.js';
import {
  OPEN_CONNECTOR_CHAT_TOOLS,
  executeOpenConnectorTool,
  getOpenConnectorChatTool,
  validateOpenConnectorToolArguments,
} from '../src/services/openConnectorChatTools.js';

const providersDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'open-connector', 'src', 'providers');

test('Inventory covers every screenshot app exactly once', () => {
  assert.equal(OPEN_CONNECTOR_APP_INVENTORY.length, 162);
  const labels = OPEN_CONNECTOR_APP_INVENTORY.map((entry) => entry.label);
  assert.equal(new Set(labels).size, labels.length);
});

test('Every phase-1 entry points at a real provider definition', () => {
  const ready = OPEN_CONNECTOR_APP_INVENTORY.filter((entry) => entry.status === 'ready');
  assert.ok(ready.length > 100);
  for (const entry of ready) {
    assert.ok(entry.ocService, `${entry.label} needs ocService`);
    assert.ok(
      existsSync(resolve(providersDir, entry.ocService, 'definition.ts')),
      `${entry.label} points at missing provider ${entry.ocService}`,
    );
  }
});

test('ocInventoryEntry namespaces OpenConnector ids', () => {
  assert.equal(ocInventoryEntry('oc_slack')?.service, 'slack');
  assert.equal(ocInventoryEntry('OC_Slack')?.service, 'slack');
  assert.equal(ocInventoryEntry('gmail'), null);
  assert.equal(ocInventoryEntry('oc_'), null);
  assert.equal(ocInventoryEntry('oc_no_such_app'), null);
});

test('ocAuthType prefers OAuth over key over custom credential', () => {
  const meta = (authTypes) => ({ authTypes, auth: [], actions: [] });
  assert.equal(ocAuthType(meta(['oauth2', 'api_key'])), 'oauth');
  assert.equal(ocAuthType(meta(['api_key', 'custom_credential'])), 'api_key');
  assert.equal(ocAuthType(meta(['custom_credential'])), 'custom_credential');
  assert.equal(ocAuthType(meta([])), 'no_auth');
});

test('ocCredentialInput shapes the frontend dialog form', () => {
  const apiKey = ocCredentialInput(
    { authTypes: ['api_key'], auth: [{ type: 'api_key', label: 'Key', description: 'Paste it' }], actions: [] },
    'api_key',
  );
  assert.equal(apiKey.fields[0].key, 'apiKey');
  assert.equal(apiKey.fields[0].type, 'password');
  const custom = ocCredentialInput(
    {
      authTypes: ['custom_credential'],
      auth: [{ type: 'custom_credential', fields: [
        { key: 'email', label: 'Email', inputType: 'email', required: true },
        { key: 'token', label: 'Token', inputType: 'password', secret: true, required: false },
      ] }],
      actions: [],
    },
    'custom_credential',
  );
  assert.deepEqual(custom.fields.map((field) => [field.key, field.type]), [['email', 'email'], ['token', 'password']]);
  assert.equal(ocCredentialInput({ authTypes: ['oauth2'], auth: [], actions: [] }, 'oauth'), undefined);
});

test('ocCatalogItem keeps stable prefixed ids and inventory names', () => {
  const entry = OPEN_CONNECTOR_APP_INVENTORY.find((item) => item.label === '高德地图');
  const item = ocCatalogItem(entry, { service: 'amap', authTypes: ['api_key'], auth: [], categories: ['Location'], actions: [{}, {}] });
  assert.equal(item.id, 'oc_amap');
  assert.equal(item.name, '高德地图');
  assert.ok(item.description.includes('2 actions'));
  assert.deepEqual(item.capabilities, ['Location']);
  assert.equal(item.credentialInput.fields[0].key, 'apiKey');
});

test('buildOpenConnectorCatalogItems skips unknown services', () => {
  const items = buildOpenConnectorCatalogItems([
    { service: 'slack', displayName: 'Slack', categories: [], authTypes: ['oauth2'], auth: [], actions: [{}] },
    { service: 'whatever', displayName: 'Whatever', categories: [], authTypes: [], auth: [], actions: [] },
  ]);
  const ids = items.map((item) => item.id);
  assert.ok(ids.includes('oc_slack'));
  assert.ok(!ids.some((id) => id.includes('whatever')));
});

test('ocCatalogItem marks served apps available', () => {
  const entry = OPEN_CONNECTOR_APP_INVENTORY.find((item) => item.label === '高德地图');
  const item = ocCatalogItem(entry, { service: 'amap', authTypes: ['api_key'], auth: [], categories: ['Location'], actions: [{}, {}] });
  assert.equal(item.available, true);
});

test('ocStubCatalogItem builds disabled entries without provider metadata', () => {
  const entry = OPEN_CONNECTOR_APP_INVENTORY.find((item) => item.label === '高德地图');
  const item = ocStubCatalogItem(entry);
  assert.equal(item.id, 'oc_amap');
  assert.equal(item.name, '高德地图');
  assert.equal(item.available, false);
  assert.deepEqual(item.capabilities, ['Actions']);
  assert.equal(item.authType, 'oauth');
  assert.equal(item.credentialInput, undefined);
});

test('buildOpenConnectorCatalogWithFallback covers the full ready inventory', () => {
  /* The inventory can map several entries to one ocService (e.g. 网易邮箱 /
     网易企业邮箱 both use netease_mail); the directory dedupes by service
     so every row has a unique id. */
  const readyServices = new Set(READY_CONNECTOR_APPS.map((entry) => entry.ocService));

  /* No sidecar: every phase-1 service appears as a disabled stub. */
  const stubs = buildOpenConnectorCatalogWithFallback(null);
  assert.equal(stubs.length, readyServices.size);
  assert.ok(stubs.length > 100);
  assert.ok(stubs.every((item) => item.available === false));
  assert.equal(new Set(stubs.map((item) => item.id)).size, stubs.length);
  for (const item of stubs) {
    assert.ok(ocInventoryEntry(item.id), `${item.id} must be a resolvable oc_ id`);
  }

  /* Partial sidecar: served apps get real metadata, the rest stay stubs. */
  const slackMeta = { service: 'slack', displayName: 'Slack', categories: ['Messaging'], authTypes: ['oauth2'], auth: [], actions: [{}, {}] };
  const mixed = buildOpenConnectorCatalogWithFallback([slackMeta]);
  assert.equal(mixed.length, readyServices.size);
  const slack = mixed.find((item) => item.id === 'oc_slack');
  assert.equal(slack.available, true);
  assert.deepEqual(slack.capabilities, ['Messaging']);
  assert.ok(slack.description.includes('2 actions'));
  const served = mixed.filter((item) => item.available === true);
  const stubCount = mixed.filter((item) => item.available === false).length;
  assert.equal(stubCount, mixed.length - served.length);
  assert.ok(served.length >= 1);
  for (const item of served) {
    assert.equal(item.service, 'slack');
  }
  /* No sidecar config at all → every entry is a stub. */
  assert.ok(buildOpenConnectorCatalogWithFallback(null).every((item) => item.available === false));
});

test('connectionNameForUser fits the sidecar naming rule', () => {
  const name = connectionNameForUser('3fa85f64-5717-4562-b3fc-2c963f66afa6');
  assert.match(name, /^[a-z0-9][a-zA-Z0-9_-]{0,63}$/);
  assert.ok(name.length <= 64);
  assert.equal(connectionNameForUser(''), 'socrates-anon');
});

test('parseSidecarError unwraps both sidecar failure shapes', () => {
  const wrapped = parseSidecarError(400, { error: { code: 'credential_verification_failed', message: 'bad key' } });
  assert.equal(wrapped.status, 400);
  assert.equal(wrapped.code, 'credential_verification_failed');
  assert.equal(wrapped.message, 'bad key');
  const flat = parseSidecarError(403, { message: 'denied', errorCode: 'authorization_failed' });
  assert.equal(flat.code, 'authorization_failed');
  assert.equal(flat.message, 'denied');
  const empty = parseSidecarError(502, null);
  assert.equal(empty.code, 'sidecar_error');
});

test('ocOAuthAppForm shapes the bring-your-own-app form', () => {  const form = ocOAuthAppForm({
    tokenEndpointAuthMethod: 'client_secret_post',
    clientConfigFields: [
      { key: 'tenant', label: 'Tenant', inputType: 'text', required: true, location: 'extra' },
      { key: 'team', label: 'Team secret', inputType: 'password', required: false, location: 'secretExtra' },
    ],
  });
  assert.equal(form.clientSecretRequired, true);
  assert.deepEqual(form.extraFields.map((field) => [field.key, field.type, field.secret]), [
    ['tenant', 'text', false],
    ['team', 'password', true],
  ]);
  assert.equal(ocOAuthAppForm({ tokenEndpointAuthMethod: 'none' }).clientSecretRequired, false);
  assert.deepEqual(ocOAuthAppForm(null).extraFields, []);
});

test('Chat tool allow-list stays unique and inventory-backed', () => {
  assert.ok(OPEN_CONNECTOR_CHAT_TOOLS.length > 300);
  const names = OPEN_CONNECTOR_CHAT_TOOLS.map((item) => item.tool);
  assert.equal(new Set(names).size, names.length);
  const readyServices = new Set(
    OPEN_CONNECTOR_APP_INVENTORY.filter((entry) => entry.status === 'ready').map((entry) => entry.ocService),
  );
  for (const item of OPEN_CONNECTOR_CHAT_TOOLS) {
    assert.match(item.tool, /^oc_[a-z0-9]+_[A-Za-z0-9_]+$/);
    assert.ok(readyServices.has(item.service), `${item.tool} references unknown service`);
    assert.ok(item.actionId.includes('.'));
    assert.ok(item.description.length > 0);
  }
});

test('Jimeng image generation exposes only the bounded 4.6 submit and result actions', () => {
  const submitName = 'oc_jimeng_ai_submit_image_generation_4_6';
  const resultName = 'oc_jimeng_ai_get_image_generation_4_6_result';
  const submit = getOpenConnectorChatTool(submitName);
  const result = getOpenConnectorChatTool(resultName);
  assert.equal(submit?.service, 'jimeng_ai');
  assert.equal(submit?.actionId, 'jimeng_ai.submit_image_generation_4_6');
  assert.equal(result?.actionId, 'jimeng_ai.get_image_generation_4_6_result');
  assert.deepEqual(Object.keys(submit?.parameters.properties || {}), ['prompt']);
  assert.deepEqual(validateOpenConnectorToolArguments(submitName, {}), {
    ok: false,
    error: 'missing required argument: prompt',
  });
  assert.equal(validateOpenConnectorToolArguments(submitName, { prompt: '   ' }).ok, false);
  assert.equal(validateOpenConnectorToolArguments(submitName, { prompt: 'a'.repeat(801) }).ok, false);
  assert.equal(validateOpenConnectorToolArguments(submitName, { prompt: 7 }).ok, false);
  assert.equal(validateOpenConnectorToolArguments(submitName, { prompt: 'a'.repeat(800) }).ok, true);
  assert.equal(validateOpenConnectorToolArguments(submitName, { prompt: 'painted sky', task_id: 'injected' }).ok, false);
  assert.equal(validateOpenConnectorToolArguments(resultName, { task_id: 'job-1' }).ok, true);
});

test('Jimeng image submit requires a connected user account at execution time', async () => {
  const toolName = 'oc_jimeng_ai_submit_image_generation_4_6';
  const args = { prompt: 'A paper-cut rabbit under a moon.' };
  for (const connection of [null, { status: 'disconnected' }, { status: 'initiated' }]) {
    const result = await executeOpenConnectorTool(toolName, args, 'user-1', connection);
    assert.equal(result.status, 'failed');
    assert.equal(result.errorCode, 'app_not_connected');
  }
});

test('Jimeng submit, completed image result, provider failure, and sidecar timeout preserve readable states', async () => {
  const previousToken = process.env.OC_SIDECAR_RUNTIME_TOKEN;
  const previousUrl = process.env.OC_SIDECAR_URL;
  const previousFetch = globalThis.fetch;
  process.env.OC_SIDECAR_RUNTIME_TOKEN = 'test-sidecar-token';
  process.env.OC_SIDECAR_URL = 'http://sidecar.test';
  const requests = [];
  try {
    globalThis.fetch = async (url, init) => {
      requests.push({ url: String(url), init });
      const responseBody = String(url).includes('get_image_generation_4_6_result')
        ? { data: { task_id: 'job-46', status: 'succeeded', is_done: true, image_urls: ['https://images.example.test/generated.png'] } }
        : { data: { task_id: 'job-46' } };
      return new Response(JSON.stringify(responseBody), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const connected = { status: 'connected', connectionName: 'socrates-user-1' };
    const submitted = await executeOpenConnectorTool(
      'oc_jimeng_ai_submit_image_generation_4_6',
      { prompt: 'A paper-cut rabbit under a moon.' },
      'user-1',
      connected,
    );
    assert.equal(submitted.status, 'completed');
    assert.equal(JSON.parse(submitted.output).data.task_id, 'job-46');
    assert.match(requests[0].url, /jimeng_ai\.submit_image_generation_4_6/);
    assert.deepEqual(JSON.parse(requests[0].init.body), {
      input: { prompt: 'A paper-cut rabbit under a moon.' },
      connectionName: 'socrates-user-1',
    });

    const completed = await executeOpenConnectorTool(
      'oc_jimeng_ai_get_image_generation_4_6_result',
      { task_id: 'job-46' },
      'user-1',
      connected,
    );
    assert.equal(completed.status, 'completed');
    assert.ok(JSON.parse(completed.output).data.image_urls.includes('https://images.example.test/generated.png'));
    assert.equal(completed.output.includes('test-sidecar-token'), false);

    globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'jimeng_generation_failed', message: 'provider rejected the prompt' } }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
    const failed = await executeOpenConnectorTool(
      'oc_jimeng_ai_submit_image_generation_4_6',
      { prompt: 'A paper-cut rabbit under a moon.' },
      'user-1',
      connected,
    );
    assert.equal(failed.status, 'failed');
    assert.equal(failed.errorCode, 'jimeng_generation_failed');
    assert.equal(failed.userMessage, 'The connected app could not complete that request.');

    globalThis.fetch = async () => { throw new DOMException('The operation was aborted.', 'AbortError'); };
    const timedOut = await executeOpenConnectorTool(
      'oc_jimeng_ai_get_image_generation_4_6_result',
      { task_id: 'job-46' },
      'user-1',
      connected,
    );
    assert.equal(timedOut.status, 'failed');
    assert.equal(timedOut.errorCode, 'sidecar_timeout');
    assert.equal(timedOut.userMessage, 'The connected app could not complete that request.');
  } finally {
    globalThis.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.OC_SIDECAR_RUNTIME_TOKEN;
    else process.env.OC_SIDECAR_RUNTIME_TOKEN = previousToken;
    if (previousUrl === undefined) delete process.env.OC_SIDECAR_URL;
    else process.env.OC_SIDECAR_URL = previousUrl;
  }
});

test('Chat tool argument validation rejects bad shapes', () => {
  const tool = 'oc_amap_search_places';
  assert.ok(getOpenConnectorChatTool(tool), 'expected fixture tool missing');
  assert.equal(validateOpenConnectorToolArguments('oc_nope_nothing', {}).ok, false);
  assert.equal(validateOpenConnectorToolArguments(tool, []).ok, false);
  assert.equal(validateOpenConnectorToolArguments(tool, { keywords: 'x', admin: true }).ok, false);
  assert.equal(validateOpenConnectorToolArguments(tool, {}).ok, false);
  assert.equal(validateOpenConnectorToolArguments(tool, { keywords: 'x'.repeat(5000) }).ok, false);
  assert.deepEqual(validateOpenConnectorToolArguments(tool, { keywords: '外滩' }), { ok: true, args: { keywords: '外滩' } });
});

test('Chat tool execution fails closed without a connection', async () => {
  const unconnected = await executeOpenConnectorTool('oc_amap_search_places', { keywords: '外滩' }, 'user-1', null);
  assert.equal(unconnected.status, 'failed');
  assert.equal(unconnected.errorCode, 'app_not_connected');
  const unknown = await executeOpenConnectorTool('oc_nope_nothing', {}, 'user-1', { status: 'connected' });
  assert.equal(unknown.status, 'failed');
  assert.equal(unknown.errorCode, 'invalid_tool_arguments');
});

test('Cloud auth snapshot covers every ready service with usable auth', () => {
  const readyServices = new Set(READY_CONNECTOR_APPS.map((entry) => entry.ocService));
  assert.ok(readyServices.size > 100);
  for (const service of readyServices) {
    const meta = OPEN_CONNECTOR_CLOUD_AUTH[service];
    assert.ok(meta, `${service} missing from cloud snapshot (regen via scripts/gen-oc-cloud-auth.mjs)`);
    assert.ok(Array.isArray(meta.authTypes) && meta.authTypes.length > 0, `${service} needs authTypes`);
    assert.ok(Array.isArray(meta.auth), `${service} needs auth array`);
    assert.ok(Array.isArray(meta.categories), `${service} needs categories`);
    assert.equal(typeof meta.actionCount, 'number', `${service} needs actionCount`);
  }
});

test('buildOpenConnectorCatalogForCloud marks snapshotted apps available', () => {
  const readyServices = new Set(READY_CONNECTOR_APPS.map((entry) => entry.ocService));
  const items = buildOpenConnectorCatalogForCloud();
  assert.equal(items.length, readyServices.size);
  assert.ok(items.length > 100);
  assert.ok(items.every((item) => item.available === true));
  assert.equal(new Set(items.map((item) => item.id)).size, items.length);
  for (const item of items) {
    assert.ok(ocInventoryEntry(item.id), `${item.id} must be a resolvable oc_ id`);
    assert.ok(item.description.includes('actions'), `${item.id} description mentions actions`);
  }
  const amap = items.find((item) => item.id === 'oc_amap');
  assert.equal(amap.authType, 'api_key');
  assert.equal(amap.credentialInput.fields[0].key, 'apiKey');
  assert.equal(amap.credentialInput.fields[0].type, 'password');
  const slack = items.find((item) => item.id === 'oc_slack');
  assert.equal(slack.authType, 'oauth');
  assert.equal(slack.credentialInput, undefined);
});

test('ocCatalogItem honors cloud-style meta without a live actions array', () => {
  const entry = OPEN_CONNECTOR_APP_INVENTORY.find((item) => item.label === '高德地图');
  const item = ocCatalogItem(entry, OPEN_CONNECTOR_CLOUD_AUTH.amap);
  assert.equal(item.id, 'oc_amap');
  assert.equal(item.available, true);
  assert.ok(item.description.includes(String(OPEN_CONNECTOR_CLOUD_AUTH.amap.actionCount)));
  assert.deepEqual(item.capabilities, OPEN_CONNECTOR_CLOUD_AUTH.amap.categories);
});

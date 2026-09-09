import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OPEN_CONNECTOR_APP_INVENTORY,
} from '../src/services/openConnectorAppInventory.js';
import {
  buildOpenConnectorCatalogItems,
  ocAuthType,
  ocCatalogItem,
  ocCredentialInput,
  ocInventoryEntry,
  ocOAuthAppForm,
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

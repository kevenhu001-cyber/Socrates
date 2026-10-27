import assert from 'node:assert/strict';
import test from 'node:test';
import { installAdminBridge } from '../src/react/adminModal/admin.bridge.ts';
import { installChatConfigurationBridge } from '../src/react/chat-configuration/chatConfiguration.bridge.ts';
import { installCheatsheetBridge } from '../src/react/cheatsheet/cheatsheet.bridge.ts';
import { installFindInSessionBridge } from '../src/react/find-in-session/find.bridge.ts';
import { installSettingsBridge } from '../src/react/settings/settings.bridge.ts';
import { installStorageBridge } from '../src/react/storageModal/storageModal.bridge.ts';

test('module-owned UI stores share updates without publishing window globals', async () => {
  const previousWindow = globalThis.window;
  globalThis.window = {};
  const stores = [
    ['__socratesAdminBridge', installAdminBridge, 'open'],
    ['__socratesChatConfigurationBridge', installChatConfigurationBridge, 'open'],
    ['__socratesCheatsheetBridge', installCheatsheetBridge, 'open'],
    ['__socratesFindInSession', installFindInSessionBridge, 'isOpen'],
    ['__socratesSettingsBridge', installSettingsBridge, 'open'],
    ['__socratesStorageBridge', installStorageBridge, 'open'],
  ];
  try {
    for (const [name, install, openKey] of stores) {
      const bridge = install();
      assert.equal(install(), bridge);
      let notifications = 0;
      const unsubscribe = bridge.subscribe(() => { notifications += 1; });
      const { revision: _revision, ...snapshot } = bridge.getSnapshot();
      bridge.publish({ ...snapshot, [openKey]: true });
      await Promise.resolve();
      assert.equal(bridge.getSnapshot()[openKey], true, name);
      assert.equal(notifications, 1, name);
      assert.equal(name in window, false, name);
      unsubscribe();
      bridge.__resetForTests();
    }
  } finally {
    globalThis.window = previousWindow;
  }
});

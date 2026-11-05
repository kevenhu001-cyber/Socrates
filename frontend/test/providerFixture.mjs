import { publishProviderConfig, resetProviderConfig } from '../src/config/providerConfig.store.ts';

/** Tests use the same provider owner as production, never window globals. */
export function installTestProvider() {
  resetProviderConfig();
  publishProviderConfig({
    providers: [{ id: 'test', name: 'test', isBuiltIn: false, apiBase: 'https://provider.example.test/v1', apiKey: 'test-key', model: 'test-model' }],
    activeId: 'test',
    fetched: true,
  });
}

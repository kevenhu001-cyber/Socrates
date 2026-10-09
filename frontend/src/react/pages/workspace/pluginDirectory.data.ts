import { pluginDirectoryRank } from './workspaceUi';
import type { PluginItem } from './types';

export function dedupePlugins(plugins: ReadonlyArray<PluginItem>): PluginItem[] {
  const seen = new Set<string>();
  const deduped: PluginItem[] = [];
  const sorted = [...plugins].sort((a, b) => pluginDirectoryRank(a.id) - pluginDirectoryRank(b.id));
  for (const plugin of sorted) {
    const serviceKey = (plugin.id || '').toLowerCase().replace(/^oc_?/, '').replace(/[^a-z0-9]/g, '');
    const nameKey = (plugin.name || '').toLowerCase().replace(/\s+/g, '');
    const canonicalKey = serviceKey || nameKey;
    if (seen.has(canonicalKey) || seen.has(nameKey)) {
      const existing = deduped.find((item) => {
        const existingService = (item.id || '').toLowerCase().replace(/^oc_?/, '').replace(/[^a-z0-9]/g, '');
        const existingName = (item.name || '').toLowerCase().replace(/\s+/g, '');
        return existingService === canonicalKey || existingName === nameKey;
      });
      if (existing && !existing.connection?.status && plugin.connection?.status) {
        existing.connection = plugin.connection;
      }
      continue;
    }
    seen.add(canonicalKey);
    seen.add(nameKey);
    deduped.push({ ...plugin });
  }
  return deduped;
}

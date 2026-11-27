import {
  ComposerPluginSelection,
  installComposerPluginSelectionBridge,
} from '../composer/pluginSelection.ts';
import { getComposerMarkdown, setComposerMarkdown } from '../composer/controller.ts';
import { activateMainView } from '../legacy/mainViewController.ts';
import { loadSession } from '../session/loader.ts';
import { workspaceForPath, replaceRoute } from '../app/router.ts';
import { openNav } from './navigation.service.ts';
import { ensureConnectorIcons, connectorIconWithFallback } from './connectorIconLoader.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { refreshProjectPlugin } from '../react/pages/workspace/workspace.service.ts';
import { apiFetch } from '../util/api/index.ts';
import type { ComposerSurface } from '../composer/types.ts';

interface WorkspaceConnector {
  id: string;
  name: string;
  auth?: string;
  connection?: unknown;
}
interface SerializedComposerPlugin {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  directiveTemplate?: string;
  iconMarkup: string;
}
interface ComposerReturnSnapshot {
  topic: SerializedComposerPlugin[];
  chat: SerializedComposerPlugin[];
  drafts: Partial<Record<ComposerSurface, string>>;
  surface: string | null;
}
interface ConnectorReturnContext {
  connectorId: string;
  returnPath: string;
  createdAt: number;
  composer: ComposerReturnSnapshot | null;
}
const workspaceCache: { connectors: WorkspaceConnector[] } = { connectors: [] };
/* Route matching and return-path replacement are provided by app/router.ts. */
const CONNECTOR_RETURN_CONTEXT_KEY = 'socrates-connector-return-v1';
const CONNECTOR_RETURN_CONTEXT_TTL = 10 * 60 * 1000;

function api(path: string, options?: undefined) {
  return apiFetch(path, options);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function isWorkspaceConnector(value: unknown): value is WorkspaceConnector {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    (value.auth === undefined || typeof value.auth === 'string')
  );
}
/* Connected-app slash commands. Each connector that has a matching
   server-side function-calling tool (see server/src/services/
   connectorTools.js) gets a slash entry so the user can invoke it
   by name from the composer. Selecting an entry drops a natural-
   language directive into the input; the model then auto-calls the
   tool via tool_choice:'auto'. Connectors without a callable tool
   (feishu/onedrive/outlook/baidu-netdisk/qq-mail/arxiv) are omitted.
   arxiv_search was removed from the slash palette
   per product request. The connector itself, the in-workspace
   "Search arXiv" dialog, and the underlying tool registration stay
   intact — users can still find arxiv via the Connectors panel. */
const APP_SLASH_HINTS: Record<string, { insert: string; description: string }> = {
  zotero: {
    insert: 'Search my Zotero library for ',
    description: 'Search your connected Zotero references',
  },
  notion: {
    insert: 'Search my Notion workspace for ',
    description: 'Search pages in your connected Notion',
  },
  github: {
    insert: 'List my GitHub repositories matching ',
    description: 'List repos from your connected GitHub',
  },
  gitee: {
    insert: 'List my Gitee repositories matching ',
    description: 'List repos from your connected Gitee',
  },
};
let _slashConnectorsLoaded = false;
/* Fetch the connector list once so the slash palette can show which
   apps are actually callable. Fire-and-forget; safe to call repeatedly. */
export function ensureSlashApps() {
  ensureConnectorIcons();
  if (_slashConnectorsLoaded && workspaceCache.connectors.length) return Promise.resolve();
  return api('/api/connectors')
    .then(function (res: unknown) {
      const connectors = isRecord(res) ? res.connectors : undefined;
      workspaceCache.connectors = Array.isArray(connectors)
        ? connectors.filter(isWorkspaceConnector)
        : [];
      _slashConnectorsLoaded = true;
    })
    .catch(function () {
      /* offline / not signed in — palette just shows templates */
    });
}
if (typeof window !== 'undefined') {
  (window as unknown as { ensureSlashApps?: typeof ensureSlashApps }).ensureSlashApps =
    ensureSlashApps;
}
/* Return the slash-command entries for apps that are callable right
   now: any connector with a live connection (arxiv_search is exposed
   only via the Connectors panel, never via the slash palette). Shape
   mirrors what the palette renderer expects. */
export interface SlashApp {
  id: string;
  title: string;
  shortcut: string;
  description: string;
  icon: string;
  insert: string;
}

export function getSlashApps(): SlashApp[] {
  return (workspaceCache.connectors || [])
    .filter(function (c) {
      if (!APP_SLASH_HINTS[c.id]) return false;
      return c.auth === 'public' || !!c.connection;
    })
    .map(function (c) {
      const hint = APP_SLASH_HINTS[c.id];
      return {
        id: c.id,
        title: c.name,
        shortcut: '/' + c.id,
        description: hint.description,
        icon: connectorIconWithFallback(c.id),
        insert: hint.insert,
      };
    });
}
if (typeof window !== 'undefined') {
  (window as unknown as { getSlashApps?: typeof getSlashApps }).getSlashApps = getSlashApps;
}

function safeConnectorReturnPath(value: unknown) {
  const path = String(value || '');
  if (
    !path ||
    path.length > 512 ||
    path.charAt(0) !== '/' ||
    path.indexOf('//') === 0 ||
    path.indexOf('\\') >= 0
  )
    return '/';
  return path;
}

function composerReturnSnapshot() {
  const bridge = installComposerPluginSelectionBridge();
  const snapshot =
    bridge && typeof bridge.getSnapshot === 'function'
      ? bridge.getSnapshot()
      : { topic: [], chat: [] };
  const draft = function (surface: string) {
    try {
      return getComposerMarkdown(surface as ComposerSurface);
    } catch (_) {
      return '';
    }
  };
  const serialisePlugins = function (plugins: readonly ComposerPluginSelection[]) {
    return (Array.isArray(plugins) ? plugins : [])
      .slice(0, 8)
      .map(function (plugin) {
        const id = String((plugin && plugin.id) || '').trim();
        if (!id) return null;
        const icon = connectorIconWithFallback(id);
        return {
          id: id,
          name: String(plugin.name || id).slice(0, 120),
          description: String(plugin.description || '').slice(0, 240),
          capabilities: Array.isArray(plugin.capabilities)
            ? plugin.capabilities.slice(0, 8).map(function (item: unknown) {
                return String(item).slice(0, 80);
              })
            : [],
          directiveTemplate: plugin.directiveTemplate
            ? String(plugin.directiveTemplate).slice(0, 300)
            : undefined,
          iconMarkup: icon || '',
        };
      })
      .filter(Boolean);
  };
  const activeTrigger = document.querySelector(
    "[data-composer-control='tools'][aria-expanded='true']",
  );
  return {
    topic: serialisePlugins(snapshot.topic),
    chat: serialisePlugins(snapshot.chat),
    drafts: { topic: draft('topic'), chat: draft('chat') },
    surface:
      activeTrigger && (activeTrigger as HTMLElement).dataset
        ? (activeTrigger as HTMLElement).dataset.composerMode || null
        : null,
  };
}

export function rememberConnectorReturnContext(connectorId: string) {
  try {
    sessionStorage.setItem(
      CONNECTOR_RETURN_CONTEXT_KEY,
      JSON.stringify({
        connectorId: String(connectorId || ''),
        returnPath: location.pathname + location.search + location.hash,
        createdAt: Date.now(),
        composer: composerReturnSnapshot(),
      }),
    );
  } catch (e) {
    reportSwallow(
      e,
      'sidebar/nav.rememberConnectorReturnContext',
    ); /* storage can be unavailable in private/embedded contexts */
  }
}

function parseComposerReturnSnapshot(value: unknown): ComposerReturnSnapshot | null {
  if (!isRecord(value)) return null;
  const parsePlugins = (candidate: unknown): SerializedComposerPlugin[] => {
    if (!Array.isArray(candidate)) return [];
    return candidate.flatMap((item): SerializedComposerPlugin[] => {
      if (!isRecord(item) || typeof item.id !== 'string') return [];
      const capabilities = Array.isArray(item.capabilities) ? item.capabilities.map(String) : [];
      return [
        {
          id: item.id,
          name: typeof item.name === 'string' ? item.name : item.id,
          description: typeof item.description === 'string' ? item.description : '',
          capabilities,
          directiveTemplate:
            typeof item.directiveTemplate === 'string' ? item.directiveTemplate : undefined,
          iconMarkup: typeof item.iconMarkup === 'string' ? item.iconMarkup : '',
        },
      ];
    });
  };
  const draftsValue = isRecord(value.drafts) ? value.drafts : {};
  const drafts: Partial<Record<ComposerSurface, string>> = {};
  if (typeof draftsValue.topic === 'string') drafts.topic = draftsValue.topic;
  if (typeof draftsValue.chat === 'string') drafts.chat = draftsValue.chat;
  return {
    topic: parsePlugins(value.topic),
    chat: parsePlugins(value.chat),
    drafts,
    surface: typeof value.surface === 'string' ? value.surface : null,
  };
}

function readConnectorReturnContext(): ConnectorReturnContext | null {
  try {
    const raw = sessionStorage.getItem(CONNECTOR_RETURN_CONTEXT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(CONNECTOR_RETURN_CONTEXT_KEY);
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const createdAt = Number(parsed.createdAt || 0);
    if (Date.now() - createdAt > CONNECTOR_RETURN_CONTEXT_TTL) return null;
    return {
      connectorId: typeof parsed.connectorId === 'string' ? parsed.connectorId : '',
      returnPath: safeConnectorReturnPath(parsed.returnPath),
      createdAt,
      composer: parseComposerReturnSnapshot(parsed.composer),
    };
  } catch (_) {
    return null;
  }
}

function restoreComposerReturnState(composer: ComposerReturnSnapshot | null) {
  if (!composer) return;
  if (composer.drafts) {
    (['topic', 'chat'] as ComposerSurface[]).forEach(function (surface) {
      if (typeof composer.drafts[surface] === 'string') {
        try {
          setComposerMarkdown(surface, composer.drafts[surface]);
        } catch (e) {
          reportSwallow(e, 'sidebar/nav.restoreComposerReturnState.setMarkdown');
        }
      }
    });
  }
  const bridge = installComposerPluginSelectionBridge();
  if (!bridge || typeof bridge.dispatch !== 'function') return;
  (['topic', 'chat'] as const).forEach(function (surface) {
    const plugins = composer[surface];
    if (!Array.isArray(plugins)) return;
    try {
      bridge.dispatch({
        type: 'replace',
        surface: surface,
        plugins: plugins
          .map(function (plugin) {
            const id = String((plugin && plugin.id) || '').trim();
            return {
              id: id,
              name: String((plugin && plugin.name) || id),
              description: String((plugin && plugin.description) || ''),
              capabilities: Array.isArray(plugin && plugin.capabilities)
                ? plugin.capabilities.map(String)
                : [],
              directiveTemplate:
                plugin && plugin.directiveTemplate ? String(plugin.directiveTemplate) : undefined,
              iconMarkup: connectorIconWithFallback(id),
            };
          })
          .filter(function (plugin) {
            return plugin.id;
          }),
      });
    } catch (e) {
      reportSwallow(e, 'sidebar/nav.ensureConnectorIcons.list');
    }
  });
}

export function restoreConnectorReturnContext() {
  const params = new URLSearchParams(location.search);
  if (!params.get('connector')) return false;
  const context = readConnectorReturnContext();
  if (!context) return false;
  const returnPath = safeConnectorReturnPath(context.returnPath);
  restoreComposerReturnState(context.composer);
  replaceRoute(returnPath);

  const workspace = workspaceForPath(new URL(returnPath, location.origin).pathname);
  if (workspace && workspace !== 'plugins') {
    openNav(workspace, { fromRoute: true });
    return true;
  }
  if (workspace === 'plugins') return false;

  const query = new URLSearchParams(new URL(returnPath, location.origin).search);
  const chatId = query.get('chat');
  if (chatId) {
    activateMainView('chatView', document);
    Promise.resolve(loadSession(chatId)).catch(function (error) {
      reportSwallow(error, 'sidebar/nav.restoreConnectorSession');
    });
  } else {
    activateMainView('topicSetup', document);
  }
  if (context.connectorId) {
    setTimeout(function () {
      void refreshProjectPlugin(context.connectorId);
    }, 0);
  }
  return true;
}

if (typeof window !== 'undefined') {
  (
    window as unknown as { rememberConnectorReturnContext?: typeof rememberConnectorReturnContext }
  ).rememberConnectorReturnContext = rememberConnectorReturnContext;
}

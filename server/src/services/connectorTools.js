/**
 * Connector-as-tool definitions and executors.
 *
 * Each connector exposes one or more OpenAI function-calling tool
 * definitions.  Tool schemas follow the same structured-contract
 * pattern as WEB_SEARCH_TOOL in webSearch.js (## What this tool
 * does / ## When to call / ## When NOT to call / ## Parameters /
 * ## Output format).
 *
 * Executors receive parsed tool-call arguments and, for auth-gated
 * connectors, the user's decrypted connector_connections row.
 * Public connectors (arxiv) receive null for the connection param.
 */

import { searchArxivPapers, ArxivConnectorError } from './arxivConnector.js';
import { listZoteroItems, ZoteroConnectorError } from './zoteroConnector.js';
import { searchNotionPages } from './notionConnector.js';
import { listGithubInstallationRepositories } from './githubConnector.js';
import { listGiteeRepositories } from './giteeConnector.js';

/* ─── Tool definitions ───────────────────────────────────── */

export const ARXIV_TOOL = {
  type: 'function',
  function: {
    name: 'arxiv_search',
    description:
      '## What this tool does\n' +
      'Searches public arXiv preprints by keyword, author, or topic. Returns up to 20 papers with title, authors, categories, publication date, abstract snippet, and links to the abstract and PDF.\n\n' +
      '## When to call\n' +
      '- Finding academic papers on a specific research topic (RAG, LLM agents, RLHF, etc.).\n' +
      '- Checking for recent preprints from a known author or lab.\n' +
      '- Literature review or related-work discovery.\n' +
      '- Answering questions that cite specific papers (the paper\'s metadata is more reliable than the model\'s training recall).\n\n' +
      '## When NOT to call\n' +
      '- Questions you can answer from general knowledge or training data.\n' +
      '- Searching for news, products, people, or non-academic content.\n' +
      '- Mathematical derivations or code — arXiv metadata is title/author/abstract only, not full text.\n\n' +
      '## Parameters\n' +
      '- query: natural-language topic, author name, or paper title (2-200 characters, plain words).\n' +
      '- limit: how many results to return (1-20, default 10).\n\n' +
      '## Output format\n' +
      'Results are returned as a numbered list. Each entry has the paper title, authors, categories, publication year, and a short summary. Include arXiv IDs and links when citing.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Research topic, author name, or paper keywords (2-200 characters, plain words, no arXiv-specific syntax needed).',
          minLength: 2,
          maxLength: 200,
        },
        limit: {
          type: 'number',
          default: 10,
          minimum: 1,
          maximum: 20,
          description: 'Number of papers to return (1-20). Use 5-10 for a quick overview, 20 for thorough coverage.',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
};

export const ZOTERO_TOOL = {
  type: 'function',
  function: {
    name: 'zotero_search',
    description:
      '## What this tool does\n' +
      'Searches your connected Zotero reference library by title, author, or year. Returns up to 100 items with title, item type (journalArticle, book, thesis, etc.), authors, date, and a link to the Zotero item page.\n\n' +
      '## When to call\n' +
      '- You have a Zotero account connected and need to find a specific reference.\n' +
      '- Checking whether you already have a paper/book on a topic in your library.\n' +
      '- Retrieving metadata for a citation you want to reference.\n\n' +
      '## When NOT to call\n' +
      '- You do not have Zotero connected (the tool will return a "not connected" error).\n' +
      '- Questions about public arXiv papers — use arxiv_search instead.\n\n' +
      '## Parameters\n' +
      '- query: optional search string — title words, author surname, or year. Leave empty to list recent items.\n\n' +
      '## Output format\n' +
      'Results are returned as a numbered list with title, item type, authors, and date. Include the Zotero URL when citing.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Optional — search by title, author, or year. Omit or leave empty to list the most recent 100 items.',
          minLength: 0,
          maxLength: 200,
        },
      },
      additionalProperties: false,
    },
  },
};

export const NOTION_TOOL = {
  type: 'function',
  function: {
    name: 'notion_search_pages',
    description:
      '## What this tool does\n' +
      'Searches your connected Notion workspace for pages matching a query. Returns page titles, URLs, and the last-edited timestamp. Searches across all pages your integration has access to (based on the OAuth permissions granted during connection).\n\n' +
      '## When to call\n' +
      '- You have a Notion account connected and need to find a specific page.\n' +
      '- Checking notes, documentation, or knowledge stored in Notion.\n' +
      '- Retrieving context from a Notion page during a conversation.\n\n' +
      '## When NOT to call\n' +
      '- You do not have Notion connected (the tool will return a "not connected" error).\n' +
      '- The information is general knowledge — use web_search instead.\n\n' +
      '## Parameters\n' +
      '- query: search term — page title words or content keywords.\n\n' +
      '## Output format\n' +
      'Returns a numbered list of matching pages with title and URL. If the user wants the full page content, say that the tool returns metadata only and ask if they want to open a specific page.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search term — page title, keyword, or topic (1-200 characters).',
          minLength: 1,
          maxLength: 200,
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
};

export const GITHUB_TOOL = {
  type: 'function',
  function: {
    name: 'github_list_repos',
    description:
      '## What this tool does\n' +
      'Lists GitHub repositories your connected GitHub App installation has access to. Returns repository names (full name like "owner/repo"), visibility (public/private), and URLs.\n\n' +
      '## When to call\n' +
      '- You have a GitHub App connected and need to see which repositories are accessible.\n' +
      '- Finding a specific repository by name.\n' +
      '- Checking whether you have access to a project.\n\n' +
      '## When NOT to call\n' +
      '- You do not have GitHub connected (the tool will return a "not connected" error).\n' +
      '- General questions about repositories you do not own — use web_search.\n\n' +
      '## Parameters\n' +
      'No parameters required. Returns all accessible repositories.\n\n' +
      '## Output format\n' +
      'Returns a list of repositories with full name, visibility, and URL.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Optional — filter repositories by name keyword. Case-insensitive partial match.',
          minLength: 0,
          maxLength: 100,
        },
      },
      additionalProperties: false,
    },
  },
};

export const GITEE_TOOL = {
  type: 'function',
  function: {
    name: 'gitee_list_repos',
    description:
      '## What this tool does\n' +
      'Lists Gitee repositories your connected account has access to. Returns repository names (full name like "owner/repo"), visibility (public/private), and URLs.\n\n' +
      '## When to call\n' +
      '- You have a Gitee account connected and need to see which repositories are accessible.\n' +
      '- Finding a specific repository by name.\n' +
      '- Checking whether you have access to a project.\n\n' +
      '## When NOT to call\n' +
      '- You do not have Gitee connected (the tool will return a "not connected" error).\n' +
      '- General questions about repositories you do not own — use web_search.\n\n' +
      '## Parameters\n' +
      'No parameters required. Returns all accessible repositories.\n\n' +
      '## Output format\n' +
      'Returns a list of repositories with full name, visibility, and URL.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Optional — filter repositories by name keyword. Case-insensitive partial match.',
          minLength: 0,
          maxLength: 100,
        },
      },
      additionalProperties: false,
    },
  },
};

/* ─── Tool name constants (used in stream.js comparison) ─── */

export const CONNECTOR_TOOL_NAMES = {
  ARXIV: 'arxiv_search',
  ZOTERO: 'zotero_search',
  NOTION: 'notion_search_pages',
  GITHUB: 'github_list_repos',
  GITEE: 'gitee_list_repos',
};

/* ─── Executors ─────────────────────────────────────────── */

/**
 * Execute a connector tool call.
 *
 * @param {string} toolName  One of CONNECTOR_TOOL_NAMES values.
 * @param {object} args      Parsed tool-call arguments.
 * @param {object|null} connection  The user's connector_connections
 *   row for the required provider, or null if not connected.
 *   Public connectors (arxiv) accept null.
 * @returns {Promise<{status:string, output:string, error?:string, errorCode?:string}>}
 */
export async function executeConnectorTool(toolName, args, connection) {
  switch (toolName) {
    /* ── arXiv (public, no auth) ──────────────────────────────── */
    case CONNECTOR_TOOL_NAMES.ARXIV: {
      const query = String(args.query || '').trim();
      if (query.length < 2) {
        return { status: 'failed', output: '', error: 'Query must be at least 2 characters.', errorCode: 'invalid_query' };
      }
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 20);
      try {
        const papers = await searchArxivPapers(query);
        const sliced = papers.slice(0, limit);
        if (sliced.length === 0) {
          return { status: 'completed', output: 'No arXiv papers found matching your query. Try different keywords or check the spelling.' };
        }
        const blocks = sliced.map((p, i) => {
          const authors = (p.authors || []).slice(0, 5).join(', ') + ((p.authors || []).length > 5 ? ' et al.' : '');
          const cats = (p.categories || []).slice(0, 3).join(', ');
          const date = p.publishedAt ? new Date(p.publishedAt).getFullYear() : '';
          return `[${i + 1}] ${p.title}\n   Authors: ${authors}\n   Categories: ${cats}\n   Published: ${date}\n   Abstract: ${(p.summary || '').slice(0, 500)}${p.summary && p.summary.length > 500 ? '…' : ''}\n   URL: ${p.abstractUrl || ''}\n   PDF: ${p.pdfUrl || ''}`;
        });
        return { status: 'completed', output: blocks.join('\n\n') };
      } catch (err) {
        const msg = (err instanceof ArxivConnectorError) ? err.message : 'arXiv search failed. Try again shortly.';
        return { status: 'failed', output: '', error: msg, errorCode: 'arxiv_search_failed' };
      }
    }

    /* ── Zotero (requires connection) ─────────────────────────── */
    case CONNECTOR_TOOL_NAMES.ZOTERO: {
      if (!connection) {
        return { status: 'failed', output: '', error: 'Zotero is not connected. Please connect it first in the Plugins panel.', errorCode: 'not_connected' };
      }
      const query = String(args.query || '').trim();
      try {
        const items = await listZoteroItems(connection, query);
        if (items.length === 0) {
          return { status: 'completed', output: query ? `No Zotero items found matching "${query}".` : 'Your Zotero library appears to be empty.' };
        }
        const blocks = items.slice(0, 50).map((item, i) => {
          const creators = (item.creators || []).slice(0, 3).join(', ') + ((item.creators || []).length > 3 ? ' et al.' : '');
          return `[${i + 1}] ${item.title}\n   Type: ${item.itemType}\n   By: ${creators}\n   Date: ${item.date || 'N/A'}\n   Zotero: ${item.url || ''}`;
        });
        const footer = items.length > 50 ? `\n\n(Showing 50 of ${items.length} items — refine your query to narrow results.)` : '';
        return { status: 'completed', output: blocks.join('\n\n') + footer };
      } catch (err) {
        const code = (err instanceof ZoteroConnectorError) ? err.code : 'zotero_search_failed';
        const msg = (err instanceof ZoteroConnectorError) ? err.message : 'Zotero search failed. Try again shortly.';
        return { status: 'failed', output: '', error: msg, errorCode: code };
      }
    }

    /* ── Notion (requires connection) ─────────────────────────── */
    case CONNECTOR_TOOL_NAMES.NOTION: {
      if (!connection) {
        return { status: 'failed', output: '', error: 'Notion is not connected. Please connect it first in the Plugins panel.', errorCode: 'not_connected' };
      }
      const query = String(args.query || '').trim();
      if (query.length < 1) {
        return { status: 'failed', output: '', error: 'Query must not be empty.', errorCode: 'invalid_query' };
      }
      try {
        const pages = await searchNotionPages(connection, query);
        if (pages.length === 0) {
          return { status: 'completed', output: `No Notion pages found matching "${query}".` };
        }
        const blocks = pages.map((p, i) =>
          `[${i + 1}] ${p.title}\n   URL: ${p.url || ''}\n   Updated: ${p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : 'N/A'}`
        );
        return { status: 'completed', output: blocks.join('\n\n') };
      } catch (err) {
        return { status: 'failed', output: '', error: err.message || 'Notion search failed. Try again shortly.', errorCode: 'notion_search_failed' };
      }
    }

    /* ── GitHub (requires connection) ─────────────────────────── */
    case CONNECTOR_TOOL_NAMES.GITHUB: {
      if (!connection) {
        return { status: 'failed', output: '', error: 'GitHub is not connected. Please connect it first in the Plugins panel.', errorCode: 'not_connected' };
      }
      const filterQuery = String(args.query || '').trim().toLowerCase();
      try {
        const repos = await listGithubInstallationRepositories(connection);
        if (repos.length === 0) {
          return { status: 'completed', output: 'No GitHub repositories are accessible. Make sure the GitHub App is installed on the repositories you want to use.' };
        }
        const filtered = filterQuery ? repos.filter((r) => r.fullName.toLowerCase().includes(filterQuery)) : repos;
        if (filtered.length === 0) {
          return { status: 'completed', output: `No GitHub repositories match "${filterQuery}".` };
        }
        const blocks = filtered.slice(0, 50).map((r, i) =>
          `[${i + 1}] ${r.fullName}\n   Visibility: ${r.private ? 'private' : 'public'}\n   URL: ${r.htmlUrl || ''}\n   Updated: ${r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : 'N/A'}`
        );
        const footer = filtered.length > 50 ? `\n\n(Showing 50 of ${filtered.length} repositories.)` : '';
        return { status: 'completed', output: blocks.join('\n\n') + footer };
      } catch (err) {
        return { status: 'failed', output: '', error: err.message || 'GitHub request failed. Try again shortly.', errorCode: 'github_request_failed' };
      }
    }

    /* ── Gitee (requires connection) ─────────────────────────── */
    case CONNECTOR_TOOL_NAMES.GITEE: {
      if (!connection) {
        return { status: 'failed', output: '', error: 'Gitee is not connected. Please connect it first in the Plugins panel.', errorCode: 'not_connected' };
      }
      const filterQuery = String(args.query || '').trim().toLowerCase();
      try {
        const repos = await listGiteeRepositories(connection);
        if (repos.length === 0) {
          return { status: 'completed', output: 'No Gitee repositories are accessible.' };
        }
        const filtered = filterQuery ? repos.filter((r) => r.fullName.toLowerCase().includes(filterQuery)) : repos;
        if (filtered.length === 0) {
          return { status: 'completed', output: `No Gitee repositories match "${filterQuery}".` };
        }
        const blocks = filtered.slice(0, 50).map((r, i) =>
          `[${i + 1}] ${r.fullName}\n   Visibility: ${r.private ? 'private' : 'public'}\n   URL: ${r.htmlUrl || ''}\n   Updated: ${r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : 'N/A'}`
        );
        const footer = filtered.length > 50 ? `\n\n(Showing 50 of ${filtered.length} repositories.)` : '';
        return { status: 'completed', output: blocks.join('\n\n') + footer };
      } catch (err) {
        return { status: 'failed', output: '', error: err.message || 'Gitee request failed. Try again shortly.', errorCode: 'gitee_request_failed' };
      }
    }

    default:
      return { status: 'failed', output: '', error: 'unknown_connector_tool', errorCode: 'unknown_tool' };
  }
}

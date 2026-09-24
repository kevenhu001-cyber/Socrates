/**
 * create_site tool — the agent-facing counterpart of the Sites surface
 * (`POST /api/creations/items/sites` + `POST /api/creations/sites/:id/publish`).
 * One call stores a complete standalone HTML document as a versioned
 * artifact and publishes it, returning the share URL the model can hand
 * back to the user.
 */

import crypto from 'node:crypto';
import { getDb } from '../db/index.js';
import { artifacts } from '../db/schema.js';

export const CREATE_SITE_TOOL = {
  type: 'function',
  function: {
    name: 'create_site',
    description:
      '## What this tool does\n' +
      'Creates a site artifact from a complete standalone HTML document and publishes it, returning the public/unlisted share URL. The site appears in the user\'s Sites directory and can be opened via the returned URL.\n\n' +
      '## When to call\n' +
      '- The user asks you to create, build, or publish a web page or small site.\n' +
      '- The site-creation extension is active and the brief is clear enough to build.\n\n' +
      '## When NOT to call\n' +
      '- The request needs a backend, database, login, or any server-side logic — the artifact is a single static HTML document.\n' +
      '- The brief is missing essential content — ask a focused question first instead of publishing a placeholder.\n\n' +
      '## Source contract\n' +
      '- `source` must be one complete HTML document (`<!doctype html>` … `</html>`) with all CSS inline in `<style>` tags. No JavaScript, no remote scripts/fonts/images, no forms, no credentials. Declare a light or dark color scheme explicitly so it renders predictably.\n\n' +
      '## Output\n' +
      'Returns `{ id, url, visibility, version, title }`. `url` is the published share link (null when visibility is "private"). Relay it to the user as a Markdown link; never invent a URL.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Short site title shown in the Sites directory and browser tab (max 120 chars).',
          minLength: 1,
          maxLength: 120,
        },
        source: {
          type: 'string',
          description: 'The complete standalone HTML document for the site — doctype through closing </html>, CSS inline, no scripts.',
          minLength: 15,
          maxLength: 200000,
        },
        visibility: {
          type: 'string',
          enum: ['private', 'unlisted', 'public'],
          description: 'Publish visibility. "unlisted" (default) gives a share link without directory listing; "public" lists it; "private" saves without a share URL.',
        },
      },
      required: ['title', 'source'],
      additionalProperties: false,
    },
  },
};

export interface CreateSiteInput {
  title: string;
  source: string;
  visibility?: string;
  sessionId?: string | null;
  projectId?: string | null;
}

export interface CreatedSite {
  id: string;
  title: string;
  visibility: string;
  version: number;
  url: string | null;
}

/**
 * Store + publish a site artifact for `userId`. Mirrors the creations
 * routes' rules: title/source trimmed to the same caps, fences stripped,
 * the document must actually contain <html>. Publishing assigns a share
 * token unless visibility is "private".
 */
export async function createAndPublishSite(userId: string, input: CreateSiteInput): Promise<CreatedSite> {
  const title = typeof input.title === 'string' ? input.title.trim().slice(0, 120) : '';
  let source = typeof input.source === 'string' ? input.source.trim() : '';
  source = source.replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/, '').trim().slice(0, 200_000);
  const visibility = input.visibility === 'public' || input.visibility === 'private' ? input.visibility : 'unlisted';

  if (!title) throw Object.assign(new Error('title is required'), { code: 'SITE_TITLE_REQUIRED' });
  if (!source.toLowerCase().includes('<html')) {
    throw Object.assign(new Error('source must be a complete HTML document'), { code: 'SITE_SOURCE_INVALID' });
  }

  const shareToken = visibility === 'private' ? null : crypto.randomBytes(24).toString('base64url');
  const [row] = await getDb().insert(artifacts).values({
    userId,
    type: 'site',
    title,
    source,
    language: 'html',
    sessionId: input.sessionId || null,
    projectId: input.projectId || null,
    visibility,
    shareToken,
  }).returning();

  return {
    id: row.id,
    title: row.title,
    visibility: row.visibility,
    version: row.version,
    url: shareToken ? `/s/${shareToken}` : null,
  };
}

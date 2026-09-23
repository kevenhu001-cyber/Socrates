import { Router } from 'express';
import { and, desc, eq, sql } from 'drizzle-orm';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getDb } from '../db/index.js';
import { artifacts, artifactVersions, files } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { getActiveApiKey } from '../services/apiKey.js';
import { callChatCompletion } from '../services/llm.js';
import { BadRequest, NotFound } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);
const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const owned = (id: string, userId: string, type: string) => and(eq(artifacts.id, id), eq(artifacts.userId, userId), eq(artifacts.type, type));
const imageSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const maxUserBytes = Number(process.env.FILES_USER_QUOTA_BYTES) || 250 * 1024 * 1024;

async function storeGeneratedImage(userId: string, prompt: string, encoded: string) {
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length < 8 || bytes.length > 25 * 1024 * 1024 || !bytes.subarray(0, 8).equals(imageSignature)) throw new BadRequest('Invalid PNG image response');
  const dir = process.env.UPLOAD_DIR || (process.env.NODE_ENV === 'production' ? '/var/lib/socrates/uploads' : path.join(os.tmpdir(), 'socrates-uploads'));
  await fs.mkdir(dir, { recursive: true });
  const storagePath = path.join(dir, `${crypto.randomUUID()}.png`);
  await fs.writeFile(storagePath, bytes);
  try {
    const row = await getDb().transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);
      const [used] = await tx.select({ total: sql<number>`coalesce(sum(${files.size}), 0)` }).from(files).where(eq(files.userId, userId));
      if (Number(used?.total || 0) + bytes.length > maxUserBytes) throw new BadRequest('Storage quota exceeded');
      const [created] = await tx.insert(files).values({ userId, name: `${prompt.slice(0, 60)}.png`, mimeType: 'image/png', size: bytes.length, kind: 'image', sha256: crypto.createHash('sha256').update(bytes).digest('hex'), storagePath }).returning();
      return created;
    });
    return { id: row.id, name: row.name, url: `/api/files/${row.id}/raw` };
  } catch (error) { await fs.unlink(storagePath).catch(() => {}); throw error; }
}

// Assistants and sites use the existing versioned artifact store. The type
// discriminator keeps these resources out of each other's editor routes.
router.get('/items/:type', async (req, res, next) => {
  try {
    if (req.params.type !== 'assistants' && req.params.type !== 'sites') throw new NotFound('Page not found');
    const type = req.params.type === 'assistants' ? 'assistant' : 'site';
    const rows = await getDb().select().from(artifacts)
      .where(and(eq(artifacts.userId, req.userId!), eq(artifacts.type, type)))
      .orderBy(desc(artifacts.updatedAt)).limit(200);
    res.json({ items: rows });
  } catch (error) { next(error); }
});

router.post('/items/:type', async (req, res, next) => {
  try {
    if (req.params.type !== 'assistants' && req.params.type !== 'sites') throw new NotFound('Page not found');
    const type = req.params.type === 'assistants' ? 'assistant' : 'site';
    const title = text(req.body?.title, 120);
    const source = text(req.body?.source, type === 'site' ? 200_000 : 20_000);
    if (!title || !source) throw new BadRequest('title and source are required');
    if (type === 'assistant') {
      let config: unknown;
      try { config = JSON.parse(source); } catch { throw new BadRequest('Assistant source must be JSON'); }
      if (!config || typeof config !== 'object' || typeof (config as Record<string, unknown>).instructions !== 'string') {
        throw new BadRequest('Assistant instructions are required');
      }
    }
    const [row] = await getDb().insert(artifacts).values({ userId: req.userId!, type, title, source, language: type === 'site' ? 'html' : 'json' }).returning();
    res.status(201).json(row);
  } catch (error) { next(error); }
});

router.patch('/items/:type/:id', async (req, res, next) => {
  try {
    if (req.params.type !== 'assistants' && req.params.type !== 'sites') throw new NotFound('Page not found');
    const type = req.params.type === 'assistants' ? 'assistant' : 'site';
    const db = getDb();
    const [existing] = await db.select().from(artifacts).where(owned(req.params.id, req.userId!, type)).limit(1);
    if (!existing) throw new NotFound('Item not found');
    const title = req.body?.title === undefined ? existing.title : text(req.body.title, 120);
    const source = req.body?.source === undefined ? existing.source : text(req.body.source, type === 'site' ? 200_000 : 20_000);
    if (!title || !source) throw new BadRequest('title and source are required');
    if (type === 'assistant') {
      let config: unknown;
      try { config = JSON.parse(source); } catch { throw new BadRequest('Assistant source must be JSON'); }
      if (!config || typeof config !== 'object' || typeof (config as Record<string, unknown>).instructions !== 'string') throw new BadRequest('Assistant instructions are required');
    }
    const changed = source !== existing.source;
    const version = existing.version + (changed ? 1 : 0);
    const [row] = await db.update(artifacts).set({ title, source, version, updatedAt: new Date() }).where(owned(existing.id, req.userId!, type)).returning();
    if (changed) await db.insert(artifactVersions).values({ artifactId: existing.id, version, source, createdBy: req.userId! });
    res.json(row);
  } catch (error) { next(error); }
});

router.delete('/items/:type/:id', async (req, res, next) => {
  try {
    if (req.params.type !== 'assistants' && req.params.type !== 'sites') throw new NotFound('Page not found');
    const type = req.params.type === 'assistants' ? 'assistant' : 'site';
    await getDb().delete(artifacts).where(owned(req.params.id, req.userId!, type));
    res.status(204).end();
  } catch (error) { next(error); }
});

router.post('/sites/:id/publish', async (req, res, next) => {
  try {
    const visibility = req.body?.visibility;
    if (visibility !== 'public' && visibility !== 'unlisted' && visibility !== 'private') throw new BadRequest('Invalid visibility');
    const db = getDb();
    const [existing] = await db.select().from(artifacts).where(owned(req.params.id, req.userId!, 'site')).limit(1);
    if (!existing) throw new NotFound('Site not found');
    const token = visibility === 'private' ? null : existing.shareToken || crypto.randomBytes(24).toString('base64url');
    const [row] = await db.update(artifacts).set({ visibility, shareToken: token, updatedAt: new Date() }).where(owned(existing.id, req.userId!, 'site')).returning();
    res.json({ id: row.id, visibility: row.visibility, version: row.version, url: token ? `/s/${token}` : null });
  } catch (error) { next(error); }
});

router.post('/sites/generate', async (req, res, next) => {
  try {
    const prompt = text(req.body?.prompt, 4000);
    if (!prompt) throw new BadRequest('prompt is required');
    const provider = await getActiveApiKey(req.userId!);
    if (!provider?.keyPlaintext) return res.status(503).json({ code: 'NO_PROVIDER', message: 'Configure an active model in Settings.' });
    const result = await callChatCompletion({
      apiBase: provider.url,
      apiKey: provider.keyPlaintext,
      model: provider.model,
      messages: [
        { role: 'system', content: 'Create one complete standalone HTML document based on the user request. Include inline CSS. Do not include JavaScript, remote scripts, forms, or credentials. Return only HTML without Markdown fences.' },
        { role: 'user', content: prompt },
      ],
      maxTokens: 6000,
      temperature: 0.6,
    });
    const source = String(result.content || '').replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/, '').trim().slice(0, 200_000);
    if (!source.toLowerCase().includes('<html')) return res.status(502).json({ code: 'SITE_GENERATION_FAILED', message: 'Model did not return a complete HTML document.' });
    res.json({ source });
  } catch (error) { next(error); }
});

router.get('/images', async (req, res, next) => {
  try {
    const rows = await getDb().select({ id: files.id, name: files.name, uploadedAt: files.uploadedAt })
      .from(files).where(and(eq(files.userId, req.userId!), eq(files.kind, 'image')))
      .orderBy(desc(files.uploadedAt)).limit(100);
    res.json({ images: rows.map((row) => ({ ...row, url: `/api/files/${row.id}/raw` })) });
  } catch (error) { next(error); }
});

router.post('/images', async (req, res, next) => {
  try {
    const prompt = text(req.body?.prompt, 4000);
    if (!prompt) throw new BadRequest('prompt is required');
    const provider = await getActiveApiKey(req.userId!);
    const model = process.env.IMAGE_MODEL || text(req.body?.model, 120);
    if (!provider?.keyPlaintext || !model) return res.status(503).json({ code: 'IMAGE_PROVIDER_NOT_CONFIGURED', message: 'Configure an image model in settings (IMAGE_MODEL) and an active provider.' });
    const endpoint = provider.url.replace(/\/(chat\/completions|responses)\/?$/, '').replace(/\/$/, '') + '/images/generations';
    const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${provider.keyPlaintext}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, prompt, size: '1024x1024', response_format: 'b64_json' }), signal: AbortSignal.timeout(120_000) });
    const data = await response.json() as { data?: { b64_json?: string }[]; error?: { message?: string } };
    if (!response.ok) return res.status(502).json({ code: 'IMAGE_PROVIDER_ERROR', message: data.error?.message || `Image provider returned ${response.status}` });
    const encoded = data.data?.[0]?.b64_json;
    if (!encoded) return res.status(502).json({ code: 'IMAGE_FORMAT_UNSUPPORTED', message: 'Image provider must return b64_json.' });
    res.status(201).json(await storeGeneratedImage(req.userId!, prompt, encoded));
  } catch (error) { next(error); }
});

router.post('/images/:id/edit', async (req, res, next) => {
  try {
    const prompt = text(req.body?.prompt, 4000);
    if (!prompt) throw new BadRequest('prompt is required');
    const [original] = await getDb().select().from(files)
      .where(and(eq(files.id, req.params.id), eq(files.userId, req.userId!), eq(files.kind, 'image'))).limit(1);
    if (!original) throw new NotFound('Image not found');
    const provider = await getActiveApiKey(req.userId!);
    const model = process.env.IMAGE_MODEL || text(req.body?.model, 120);
    if (!provider?.keyPlaintext || !model) return res.status(503).json({ code: 'IMAGE_PROVIDER_NOT_CONFIGURED', message: 'Configure an image model and active provider.' });
    const endpoint = provider.url.replace(/\/(chat\/completions|responses)\/?$/, '').replace(/\/$/, '') + '/images/edits';
    const form = new FormData();
    form.set('model', model);
    form.set('prompt', prompt);
    form.set('response_format', 'b64_json');
    form.set('image', new Blob([await fs.readFile(original.storagePath)], { type: original.mimeType }), original.name);
    const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${provider.keyPlaintext}` }, body: form, signal: AbortSignal.timeout(120_000) });
    const data = await response.json() as { data?: { b64_json?: string }[]; error?: { message?: string } };
    if (!response.ok) return res.status(502).json({ code: 'IMAGE_PROVIDER_ERROR', message: data.error?.message || `Image provider returned ${response.status}` });
    const encoded = data.data?.[0]?.b64_json;
    if (!encoded) return res.status(502).json({ code: 'IMAGE_FORMAT_UNSUPPORTED', message: 'Image provider must return b64_json.' });
    res.status(201).json(await storeGeneratedImage(req.userId!, prompt, encoded));
  } catch (error) { next(error); }
});

export default router;

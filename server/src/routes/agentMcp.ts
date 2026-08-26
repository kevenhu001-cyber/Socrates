import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { projects } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { BadRequest, NotFound } from '../lib/errors.js';
import {
  CODEX_MCP_ENABLED,
  checkCodexMcpHealth,
  getCodexMcpCatalog,
  listCodexMcpServers,
  setCodexMcpEnabled,
  validateProjectId,
} from '../services/codexMcp.js';

const router = Router();
router.use(requireAuth);

async function ownedProject(userId: string, projectId: string | null) {
  if (!projectId) return;
  const db = getDb();
  const [project] = await db.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId))).limit(1);
  if (!project) throw new NotFound('Project not found');
}

router.get('/', async (req, res, next) => {
  try {
    const projectId = validateProjectId(req.query.projectId);
    await ownedProject(req.userId!, projectId);
    const servers = await listCodexMcpServers(req.userId!, projectId);
    res.json({
      enabled: CODEX_MCP_ENABLED,
      configured: getCodexMcpCatalog().length > 0,
      projectId,
      servers,
      policy: { urls: 'server_catalog_only', credentials: 'server_managed', approval: 'on-request' },
    });
  } catch (err) { next(err); }
});

router.patch('/:serverKey', async (req, res, next) => {
  try {
    const projectId = validateProjectId(req.body?.projectId);
    await ownedProject(req.userId!, projectId);
    const enabled = req.body?.enabled;
    if (typeof enabled !== 'boolean') throw new BadRequest('enabled must be a boolean');
    const result = await setCodexMcpEnabled(req.userId!, String(req.params.serverKey), projectId, enabled);
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/:serverKey/health', async (req, res, next) => {
  try {
    const projectId = validateProjectId(req.body?.projectId);
    await ownedProject(req.userId!, projectId);
    const result = await checkCodexMcpHealth(req.userId!, String(req.params.serverKey), projectId);
    res.json(result);
  } catch (err) { next(err); }
});

export default router;

import { Router } from 'express';
import { eq, and, inArray, or } from 'drizzle-orm';
import fs from 'node:fs/promises';
import { getDb } from '../db/index.js';
import { codeInterpreter } from '../services/codeInterpreter.js';
import {
  projects, sessions, messages, memories, artifacts, artifactVersions,
  mistakes, agentRuns, usageEvents, files, executions,
} from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { NotFound, BadRequest } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

/* GET /api/projects — list projects */
router.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    const rows = await db.select().from(projects)
      .where(eq(projects.userId, req.userId!))
      .orderBy(projects.createdAt);
    return res.json({ projects: rows });
  } catch (err) { next(err); }
});

/* POST /api/projects — create */
router.post('/', async (req, res, next) => {
  try {
    const { name, description, color, icon, systemPrompt } = req.body;
    if (!name) throw new BadRequest('name is required');
    const db = getDb();
    const [project] = await db.insert(projects).values({
      userId: req.userId!,
      name, description, color, icon, systemPrompt,
    }).returning();
    return res.status(201).json(project);
  } catch (err) { next(err); }
});

/* PATCH /api/projects/:id — update */
router.patch('/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const [existing] = await db.select().from(projects)
      .where(and(eq(projects.id, req.params.id), eq(projects.userId, req.userId!)))
      .limit(1);
    if (!existing) throw new NotFound('Project not found');
    const patch: Record<string, unknown> = {};
    for (const key of ['name', 'description', 'color', 'icon', 'systemPrompt']) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }
    if (Object.keys(patch).length) {
      await db.update(projects).set(patch).where(eq(projects.id, req.params.id));
    }
    const [updated] = await db.select().from(projects).where(eq(projects.id, req.params.id)).limit(1);
    return res.json(updated);
  } catch (err) { next(err); }
});

/* DELETE /api/projects/:id
 *
 * Projects own more than the row in `projects`: sessions, messages,
 * session-scoped files, generated artifacts, project memories, execution
 * records, and their operational metadata all carry the project context
 * directly or through a project session. Delete the full graph in one DB
 * transaction so the API cannot report success while related rows remain.
 * Physical upload files are removed only after the transaction commits. */
router.delete('/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const projectId = req.params.id;
    const deletedFilePaths: string[] = [];
    const deletedSessionIds: string[] = [];

    await db.transaction(async (tx) => {
      const [project] = await tx.select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.userId, req.userId!)))
        .for('update')
        .limit(1);
      if (!project) throw new NotFound('Project not found');

      const projectSessionRows = await tx.select({ id: sessions.id })
        .from(sessions)
        .where(and(eq(sessions.projectId, projectId), eq(sessions.userId, req.userId!)))
        .for('update');
      deletedSessionIds.push(...projectSessionRows.map((row) => row.id));

      const executionIds: string[] = [];
      if (deletedSessionIds.length > 0) {
        const executionRows = await tx.select({ id: executions.id })
          .from(executions)
          .where(and(eq(executions.userId, req.userId!), inArray(executions.sessionId, deletedSessionIds)));
        executionIds.push(...executionRows.map((row) => row.id));
      }

      const projectArtifactRows = await tx.select({ id: artifacts.id })
        .from(artifacts)
        .where(and(eq(artifacts.userId, req.userId!), eq(artifacts.projectId, projectId)));
      const sessionArtifactRows = deletedSessionIds.length > 0
        ? await tx.select({ id: artifacts.id })
          .from(artifacts)
          .where(and(eq(artifacts.userId, req.userId!), inArray(artifacts.sessionId, deletedSessionIds)))
        : [];
      const artifactIds = [...new Set([
        ...projectArtifactRows.map((row) => row.id),
        ...sessionArtifactRows.map((row) => row.id),
      ])];
      if (artifactIds.length > 0) {
        await tx.delete(artifactVersions).where(inArray(artifactVersions.artifactId, artifactIds));
        await tx.delete(artifacts).where(inArray(artifacts.id, artifactIds));
      }

      await tx.delete(memories).where(and(
        eq(memories.userId, req.userId!),
        eq(memories.projectId, projectId),
      ));

      const fileScopes = [];
      if (deletedSessionIds.length > 0) fileScopes.push(inArray(files.sessionId, deletedSessionIds));
      if (executionIds.length > 0) fileScopes.push(inArray(files.executionId, executionIds));
      if (fileScopes.length > 0) {
        const projectFiles = await tx.select({ storagePath: files.storagePath, thumbnailPath: files.thumbnailPath })
          .from(files)
          .where(and(eq(files.userId, req.userId!), or(...fileScopes)));
        deletedFilePaths.push(...projectFiles.flatMap((file) => [file.storagePath, file.thumbnailPath].filter((filePath): filePath is string => !!filePath)));
        await tx.delete(files).where(and(eq(files.userId, req.userId!), or(...fileScopes)));
      }

      if (executionIds.length > 0) {
        await tx.delete(executions).where(and(
          eq(executions.userId, req.userId!),
          inArray(executions.id, executionIds),
        ));
      }
      if (deletedSessionIds.length > 0) {
        await tx.delete(mistakes).where(and(eq(mistakes.userId, req.userId!), inArray(mistakes.sessionId, deletedSessionIds)));
        await tx.delete(agentRuns).where(and(eq(agentRuns.userId, req.userId!), inArray(agentRuns.sessionId, deletedSessionIds)));
        await tx.delete(usageEvents).where(and(eq(usageEvents.userId, req.userId!), inArray(usageEvents.sessionId, deletedSessionIds)));
        await tx.delete(messages).where(inArray(messages.sessionId, deletedSessionIds));
        await tx.delete(sessions).where(and(
          eq(sessions.userId, req.userId!),
          inArray(sessions.id, deletedSessionIds),
        ));
      }

      await tx.delete(projects)
        .where(and(eq(projects.id, projectId), eq(projects.userId, req.userId!)));
    });

    await Promise.all([...new Set(deletedFilePaths)].map((storagePath) => fs.unlink(storagePath).catch(() => {})));
    await Promise.all(deletedSessionIds.map((sessionId) => codeInterpreter.reapSessionScratch(sessionId).catch(() => {})));
    return res.status(204).end();
  } catch (err) { next(err); }
});

export default router;

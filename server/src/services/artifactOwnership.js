import { and, eq } from 'drizzle-orm';
import { artifacts } from '../db/schema.js';
import { NotFound } from '../lib/errors.js';

export async function requireOwnedArtifact(db, artifactId, userId) {
  const [a] = await db.select({ id: artifacts.id }).from(artifacts)
    .where(and(eq(artifacts.id, artifactId), eq(artifacts.userId, userId)))
    .limit(1);
  if (!a) throw new NotFound('Artifact not found');
  return a;
}

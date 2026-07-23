import { and, eq } from 'drizzle-orm';
import { artifacts } from '../db/schema.js';
import { NotFound } from '../lib/errors.js';
import type { Database } from '../db/index.js';

export async function requireOwnedArtifact(db: Database, artifactId: string, userId: string) {
  const [a] = await db.select({ id: artifacts.id }).from(artifacts)
    .where(and(eq(artifacts.id, artifactId), eq(artifacts.userId, userId)))
    .limit(1);
  if (!a) throw new NotFound('Artifact not found');
  return a;
}

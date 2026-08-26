import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  /* The schema is TypeScript in the source tree. Point drizzle-kit at the
   * source extension so migration generation does not silently fail before
   * it can compare the current tables. */
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgres://socrates:socrates@localhost:5432/socrates',
  },
});

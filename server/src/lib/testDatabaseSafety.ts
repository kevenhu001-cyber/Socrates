/** Refuse test writes to a default/production database. No escape hatch:
 * use a dedicated database named *_test*, *_qa*, or an explicit test prefix. */
export function assertTestDatabaseUrl(databaseUrl: string | undefined): void {
  if (!databaseUrl) return; // DB suites may intentionally skip
  let name = '';
  try { name = decodeURIComponent(new URL(databaseUrl).pathname.slice(1)); }
  catch { throw new Error('Invalid test DATABASE_URL (credentials omitted)'); }
  if (!/(?:^|[_-])(?:test|tests|qa)(?:$|[_-])/i.test(name)) {
    throw new Error('Refusing test database access: DATABASE_URL must name a dedicated test/qa database. Set TEST_DATABASE_URL or DATABASE_URL explicitly; never run tests against the production .env.');
  }
}

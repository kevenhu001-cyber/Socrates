import 'dotenv/config';
import { assertTestDatabaseUrl } from '../src/lib/testDatabaseSafety.ts';

// dotenv preserves explicitly supplied variables. An explicit test target
// wins over the production checkout's .env for every spawned test process.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
assertTestDatabaseUrl(process.env.DATABASE_URL);

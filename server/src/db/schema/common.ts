import { customType } from 'drizzle-orm/pg-core';

/* bytea — Postgres binary type. Used by tts_results.audio to persist
   synthesized speech bytes without base64 inflation. The custom type
   maps to the Buffer JS shape that routes/tts.ts already works with,
   so no extra encode/decode hops in the request path. */
export const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
  dataType: () => 'bytea',
});

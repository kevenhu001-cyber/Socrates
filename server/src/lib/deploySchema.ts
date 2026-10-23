export interface ForeignKeyShape {
  source_column: string;
  target_table: string;
  target_column: string;
  on_delete: string;
  validated: boolean;
}

/** Check semantics, not Drizzle-generated names: older manual migrations use
 * PostgreSQL's *_fkey naming but still provide the same integrity guarantee. */
export function missingScheduledTaskForeignKeys(rows: ForeignKeyShape[]): string[] {
  return [
    { column: 'user_id', target: 'users', action: 'c' },
    { column: 'session_id', target: 'sessions', action: 'n' },
  ].filter((expected) => !rows.some((row) => row.source_column === expected.column
    && row.target_table === expected.target && row.target_column === 'id'
    && row.on_delete === expected.action && row.validated))
    .map((expected) => `scheduled_tasks.${expected.column} -> ${expected.target}.id`);
}

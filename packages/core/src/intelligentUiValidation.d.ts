export function validateIntelligentUi(value: unknown):
  | { ok: true }
  | {
      ok: false;
      error: string;
      nodeId?: string | null;
      kind?: 'document' | 'node' | 'openui' | 'demonstration' | 'physics' | 'learning' | 'visualization';
      issues?: Array<{ path: string; message: string }>;
    };

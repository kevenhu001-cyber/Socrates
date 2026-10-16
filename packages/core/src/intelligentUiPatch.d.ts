import type { TurnUiNode } from '../../contracts/src/turnEvent.js';
export function applyIntelligentUiPatch(nodes: TurnUiNode[], operations: unknown): { ok: true; nodes: TurnUiNode[] } | { ok: false; error: string };

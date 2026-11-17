import type { TurnUiNode } from '@socrates/contracts';
export function applyIntelligentUiPatch(nodes: TurnUiNode[], operations: unknown): { ok: true; nodes: TurnUiNode[] } | { ok: false; error: string };

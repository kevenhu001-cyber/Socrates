export interface PhysicsParameter { key: string; label: string; unit: string; min: number; max: number; step: number; initial: number }
export interface PhysicsModelDefinition { id: string; title: string; assumption: string; equation: string; parameters: readonly PhysicsParameter[] }
export const PHYSICS_MODELS: readonly PhysicsModelDefinition[];
export function physicsModelDefinition(scene: unknown): PhysicsModelDefinition | undefined;
export function physicsParameters(scene: string, input?: Record<string, unknown>): Record<string, number>;
export function physicsParametersError(scene: unknown, input: unknown): string | null;

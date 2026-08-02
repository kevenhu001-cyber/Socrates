// frontend/src/extensions/registry.ts
// Single source of truth for all composer extensions.
//
// Modules declare an ExtensionDefinition and call registerExtension()
// during installExtensions(). The three consumers read the same
// registry: React "+" tools menu, legacy extensions picker, and any
// future shortcut table.

import type { ExtensionDefinition, ExtensionPlacement } from './types';

const PLACEMENT_KEYS: Array<keyof ExtensionPlacement> = ['tools', 'picker'];

export class ExtensionRegistry {
  private map = new Map<string, ExtensionDefinition>();

  register(def: ExtensionDefinition): this {
    if (!def || !def.key) {
      throw new Error('[extensions] register() requires a non-empty `key`.');
    }
    if (this.map.has(def.key)) {
      throw new Error(`[extensions] Duplicate extension key: ${def.key}`);
    }
    this.validate(def);
    this.map.set(def.key, def);
    return this;
  }

  private validate(def: ExtensionDefinition): void {
    if (def.kind === 'template') {
      if (typeof def.systemPrompt !== 'string') {
        throw new Error(`[extensions] Template "${def.key}" requires a string systemPrompt.`);
      }
    }
    if (def.kind === 'toggle' && typeof def.onActivate !== 'function' && typeof def.onDeactivate !== 'function') {
      throw new Error(`[extensions] Toggle "${def.key}" should declare onActivate/onDeactivate.`);
    }
  }

  get(key: string): ExtensionDefinition | undefined {
    return this.map.get(key);
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  /** All registered definitions, in registration order. */
  all(): ExtensionDefinition[] {
    return [...this.map.values()];
  }

  /** Definitions placed in a given surface, ascending by order. */
  byPlacement(placement: 'tools' | 'picker'): ExtensionDefinition[] {
    return this.all()
      .filter((def) => typeof def.placement[placement] === 'number')
      .sort((a, b) => {
        const ao = a.placement[placement] ?? Number.MAX_SAFE_INTEGER;
        const bo = b.placement[placement] ?? Number.MAX_SAFE_INTEGER;
        return ao - bo;
      });
  }
}

/** Global singleton — modules import this and call registerExtension(). */
export const registry = new ExtensionRegistry();

/** Convenience wrapper for module files. */
export function registerExtension(def: ExtensionDefinition): void {
  registry.register(def);
}

/** Placement keys used by tests / renderers. */
export { PLACEMENT_KEYS };

import { physicsDemonstrationProgram, physicsModelDefinition } from '@socrates/core';
import { Demonstration } from '../demonstration/Demonstration';
import { i18n } from '../../legacy/gateway';

export interface PhysicsLabProps { scene: string; title?: string; parameters?: Record<string, unknown> }

/** Compatibility for stored scene IDs; all physics uses the same Intelligence UI views. */
export function PhysicsLab({ scene, title, parameters }: PhysicsLabProps) {
  const program = physicsDemonstrationProgram(scene, parameters);
  const model = physicsModelDefinition(scene);
  if (!program || !model) return null;
  const rayleighLabels: Record<string, string> = { separation: 'rayleighSeparation', wavelength: 'rayleighWavelength', aperture: 'rayleighAperture', exposure: 'rayleighExposure' };
  program.parameters = program.parameters?.map(parameter => ({ ...parameter,
    label: scene === 'rayleigh' ? i18n(`intui.${rayleighLabels[parameter.id]}`, parameter.label || parameter.id)
      : i18n(`intui.physics.${scene}.${parameter.id}`, parameter.label || parameter.id),
  }));
  if (scene === 'rayleigh' && program.presets) program.presets = program.presets.map(preset => ({ ...preset, label: i18n('intui.rayleighAtLimit', preset.label || '') }));
  return <div data-physics-scene={scene}>
    <Demonstration program={program} title={title || i18n(`intui.physics.${scene}.title`, model.title)} />
    <p className="intui-text">{i18n(`intui.physics.${scene}.assumption`, model.assumption)}</p>
  </div>;
}

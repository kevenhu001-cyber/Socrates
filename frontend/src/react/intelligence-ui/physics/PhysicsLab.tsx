import { physicsParameters } from '@socrates/core';
import { ModelLab, type ModelLabProps } from './ModelLab';
import { RayleighLab } from './RayleighLab';

/** The same model contract composes with native panels, charts and prose. */
export function PhysicsLab(props: ModelLabProps) {
  if (props.scene === 'rayleigh') {
    const p = physicsParameters('rayleigh', props.parameters);
    return <RayleighLab title={props.title} separation={p.separation} wavelength={p.wavelength} aperture={p.aperture} />;
  }
  return <ModelLab {...props} />;
}

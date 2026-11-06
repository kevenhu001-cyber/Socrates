import { defineComponent } from '@openuidev/react-lang';
import { z } from 'zod/v4';
import { RayleighLab } from '../physics/RayleighLab';

export const Rayleigh = defineComponent({
  name: 'Rayleigh',
  props: z.object({ title: z.string(), separation: z.number().min(.2).max(3).optional(), wavelength: z.number().min(380).max(750).optional(), aperture: z.number().min(10).max(300).optional() }),
  description: 'Native local Canvas circular-aperture diffraction lab. Two equal incoherent point sources approach continuously; Airy intensity from Bessel J1, additive intensities and linear cross-section. Arguments: title, separation in reference Airy radii (default 2.4), wavelength in nm (default 550), aperture diameter in mm (default 100). Optical parameters and display exposure are adjustable. Prefer this to SVG circles or searched images for Rayleigh resolution. No network or generated executable code.',
  component: ({ props }) => <RayleighLab {...props} />,
});

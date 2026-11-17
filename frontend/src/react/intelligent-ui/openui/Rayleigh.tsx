import { defineComponent } from '@openuidev/react-lang';
import { z } from 'zod/v4';
import { PhysicsLab } from '../physics/PhysicsLab';

export const Rayleigh = defineComponent({
  name: 'Rayleigh',
  props: z.object({ title: z.string(), separation: z.number().min(.2).max(3).optional(), wavelength: z.number().min(380).max(750).optional(), aperture: z.number().min(10).max(300).optional() }),
  description: 'Compatibility adapter for stored OpenUI Rayleigh programs. Uses the same Intelligence UI demonstration program, controls, field and plot renderer as all physics. New physical models should use a native demonstration node with freely composed mathematical views. Arguments: title, separation in reference Airy radii (default 2.4), wavelength in nm (default 550), aperture diameter in mm (default 100). Equal incoherent source intensities add through an ideal circular pupil; no network or generated executable code.',
  component: ({ props: { title, separation, wavelength, aperture } }) => <PhysicsLab scene="rayleigh" title={title} parameters={{ separation, wavelength, aperture }} />,
});

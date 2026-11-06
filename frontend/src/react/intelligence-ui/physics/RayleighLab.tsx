import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '../../ui/Button';
import { NativeControl } from '../../ui/NativeControl';
import { Label } from '../../ui/shadcn/label';
import { i18n } from '../../legacy/gateway';
import { boundedParameter, pairIntensity, rayleighAngle } from './optics';

export interface RayleighLabProps { title?: string; separation?: number; wavelength?: number; aperture?: number }

/** Native Canvas renderer: no generated code, SVG light sources, plugins or network. */
export function RayleighLab(props: RayleighLabProps) {
  const id = useId();
  const canvas = useRef<HTMLCanvasElement>(null);
  const initial = boundedParameter(props.separation, 2.4, .2, 3);
  const [separation, setSeparation] = useState(initial);
  const [wavelength, setWavelength] = useState(boundedParameter(props.wavelength, 550, 380, 750));
  const [aperture, setAperture] = useState(boundedParameter(props.aperture, 100, 10, 300));
  const [playing, setPlaying] = useState(false);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [available, setAvailable] = useState(true);
  const [exposure, setExposure] = useState(1.8);
  const title = props.title || i18n('intui.rayleighTitle', 'Rayleigh criterion');
  const tr = (key: string, text: string) => i18n(`intui.${key}`, text);
  useEffect(() => {
    setSeparation(initial);
    setWavelength(boundedParameter(props.wavelength, 550, 380, 750));
    setAperture(boundedParameter(props.aperture, 100, 10, 300));
  }, [initial, props.wavelength, props.aperture]);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { setReduced(media.matches); if (media.matches) setPlaying(false); };
    update();
    setPlaying(!media.matches);
    media.addEventListener('change', update);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    if (canvas.current) observer.observe(canvas.current);
    return () => { media.removeEventListener('change', update); observer.disconnect(); };
  }, []);
  useEffect(() => {
    if (!playing || !visible || reduced) return;
    let frame = 0, previous = performance.now();
    const tick = (now: number) => {
      if (document.hidden) { previous = now; frame = requestAnimationFrame(tick); return; }
      if (now - previous >= 40) {
        const dt = Math.min((now - previous) / 1000, .1); previous = now;
        setSeparation(value => Math.max(.2, value - dt * .16));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, visible, reduced]);
  useEffect(() => { if (separation <= .2) setPlaying(false); }, [separation]);
  // Fixed angular viewport relative to the default optic: changing wavelength or
  // pupil really changes the spot radius, rather than silently rescaling the axes.
  const radius = rayleighAngle(wavelength, aperture) / rayleighAngle(550, 100);
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) { setAvailable(false); return; }
    const width = 480, height = 240;
    const pixels = context.createImageData(width, height);
    // Neutral intensity display; optical wavelength changes size, not the display tint.
    const hue = [1, .98, .87];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const intensity = pairIntensity((x - width / 2) / 50 / radius, (y - height / 2) / 50 / radius, separation / radius);
      const light = (1 - Math.exp(-intensity * exposure)) ** (1 / 2.2);
      const offset = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel++) pixels.data[offset + channel] = 255 * Math.min(1, light * hue[channel]);
      pixels.data[offset + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
  }, [separation, radius, exposure, wavelength]);
  const ratio = separation / radius;
  const angle = rayleighAngle(550, 100) * separation * 206264.806;
  const profile = Array.from({ length: 241 }, (_, i) => `${i ? 'L' : 'M'}${i * 2},${92 - pairIntensity((i - 120) / 25 / radius, 0, ratio) * 40}`).join(' ');
  const controls = [
    { key: 'rayleighWavelength', label: tr('rayleighWavelength', 'Wavelength'), value: wavelength, min: 380, max: 750, step: 1, unit: 'nm', set: setWavelength },
    { key: 'rayleighAperture', label: tr('rayleighAperture', 'Aperture'), value: aperture, min: 10, max: 300, step: 1, unit: 'mm', set: setAperture },
    { key: 'rayleighExposure', label: tr('rayleighExposure', 'Display exposure'), value: exposure, min: .5, max: 5, step: .1, unit: '', set: setExposure },
  ];
  return <section className="intui-physics demonstration" aria-label={title}>
    <header><strong>{title}</strong><p>{tr('rayleighModel', 'Ideal circular aperture · two equal, incoherent point sources')}</p></header>
    <canvas ref={canvas} width={480} height={240} role="img" aria-label={`${title}: ${ratio.toFixed(2)} θR`} />
    {!available ? <p role="status">{tr('rayleighNoCanvas', 'Canvas is unavailable. Use the intensity profile and numerical readout below.')}</p> : null}
    <output className="intui-physics-readout">{tr('rayleighSeparation', 'Separation')} {angle.toFixed(2)}″ · {ratio.toFixed(2)} θR · {Math.abs(ratio - 1) < .025 ? tr('rayleighLimit', 'At the Rayleigh limit') : ratio > 1 ? tr('rayleighResolved', 'Above the Rayleigh limit') : tr('rayleighMerged', 'Below the Rayleigh limit')}</output>
    <svg viewBox="0 0 480 100" role="img" aria-label={tr('rayleighProfile', 'Linear intensity profile through both sources')}><path d="M0 92H480" stroke="currentColor" opacity=".25" /><path d={profile} fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
    <p className="intui-physics-caption">{tr('rayleighFormula', 'I(r) = [2J₁(u)/u]²; u = πDθ/λ. Intensities add. θR ≈ 1.22λ/D. The profile is linear; the image uses display exposure.')}</p>
    <div className="intui-physics-toolbar">
      <Button variant="outline" disabled={reduced} aria-pressed={playing} onClick={() => { if (separation <= .2) setSeparation(initial); setPlaying(value => !value); }}>{playing ? tr('simPause', 'Pause') : tr('simPlay', 'Play')}</Button>
      <Button variant="outline" onClick={() => { setPlaying(false); setSeparation(radius); }}>{tr('rayleighAtLimit', 'Show Rayleigh limit')}</Button>
    </div>
    <Label className="intui-physics-parameter" htmlFor={`${id}-separation`}>{tr('rayleighSeparation', 'Separation')}<NativeControl id={`${id}-separation`} type="range" min={.2} max={Math.max(3, radius * 2.4)} step={.01} value={separation} onChange={event => { setPlaying(false); setSeparation(Number(event.target.value)); }} /></Label>
    <details><summary>{tr('rayleighParameters', 'Optical parameters')}</summary>{controls.map(control => <Label className="intui-physics-parameter" key={control.key} htmlFor={`${id}-${control.key}`}><span>{control.label} · {control.value} {control.unit}</span><NativeControl id={`${id}-${control.key}`} type="range" min={control.min} max={control.max} step={control.step} value={control.value} onChange={event => { setPlaying(false); control.set(Number(event.target.value)); }} /></Label>)}</details>
  </section>;
}

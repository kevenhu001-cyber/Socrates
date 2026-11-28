import { useId, useState } from 'react';
import { NativeControl } from '../../../ui/NativeControl';
import { Label } from '../../../ui/shadcn/label';
import { i18n } from '../../../../ui/legacyI18n.ts';

export function useSurfaceCamera() {
  const [azimuth, setAzimuth] = useState(35);
  const [elevation, setElevation] = useState(30);
  return { azimuth, elevation, setAzimuth, setElevation };
}
export function CameraControls({
  azimuth,
  elevation,
  setAzimuth,
  setElevation,
}: Readonly<ReturnType<typeof useSurfaceCamera>>) {
  const id = useId();
  return (
    <div className="demo-controls">
      <div className="demo-control">
        <Label htmlFor={id + '-az'}>{i18n('intui.demo.azimuth', 'Azimuth')}</Label>
        <NativeControl
          id={id + '-az'}
          type="range"
          min="-180"
          max="180"
          value={azimuth}
          onChange={(event) => setAzimuth(Number(event.target.value))}
        />
        <output>{azimuth}°</output>
      </div>
      <div className="demo-control">
        <Label htmlFor={id + '-el'}>{i18n('intui.demo.elevation', 'Elevation')}</Label>
        <NativeControl
          id={id + '-el'}
          type="range"
          min="5"
          max="85"
          value={elevation}
          onChange={(event) => setElevation(Number(event.target.value))}
        />
        <output>{elevation}°</output>
      </div>
    </div>
  );
}

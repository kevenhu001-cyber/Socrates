import { lazy, Suspense, memo, useEffect, useId, useRef } from 'react';
import type { DemonstrationField } from '@socrates/core/demonstration';
import { i18n } from '../../../ui/legacyI18n.ts';
import { MathText } from '../../rn/useInlineMath';
import { DemoIssue } from './DemonstrationIssue';
import type { FieldSample } from './sampleField';
import { FIELD_WIDTH, fieldHeight, isSpatialField } from './fieldCommon';
import { paintField } from './renderers/fieldCanvas';

const DemoSurface=lazy(()=>import('./DemonstrationSurface').then(m=>({default:m.DemoSurface})));

export const DemoField = memo(function DemoField({
  view,
  sample,
  problem,
}: {
  view: DemonstrationField;
  sample?: FieldSample;
  problem?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scaleId = useId();
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context || !sample || sample.surface) return;
    paintField(context,view,sample);
  }, [sample, view]);

  const headline = view.label
    ? i18n('intui.demo.failedNamed', 'Could not compute “{name}”').replace('{name}', view.label)
    : i18n('intui.demo.failedView', 'This view could not be computed');
  return (
    <figure className="demo-field">
      {view.label ? (
        <figcaption>
          <MathText text={view.label} />
        </figcaption>
      ) : null}
      {isSpatialField(view) ? (
        <Suspense fallback={<div className="demo-note" role="status">{i18n('intui.demo.loading','Loading…')}</div>}>
          <DemoSurface sample={sample?.surface} label={view.label} style={view.surfaceStyle??(view.presentation==='isosurface'?'shaded':undefined)} />
        </Suspense>
      ) : (
        <canvas ref={canvas} width={FIELD_WIDTH} height={fieldHeight(view)} role="img"
          aria-label={view.label || i18n('intui.surface', 'Interactive result')} />
      )}
      {sample?.markers?.map((m,i)=><div className="demo-legend" key={i}><span>{m.label||i18n('intui.demo.marker','Marker {n}').replace('{n}',String(i+1))}: ({Number(m.x.toPrecision(5))}, {Number(m.y.toPrecision(5))})</span></div>)}
      {sample?.slice && <div className="demo-legend"><span>{i18n('intui.demo.slicePlane','Slice plane')}: {sample.slice.axis} = {Number(sample.slice.position.toPrecision(5))}</span><span>{sample.slice.axis==='x'?'y / z':sample.slice.axis==='y'?'x / z':'x / y'}</span></div>}
      {sample?.colorRange ? (
        <div className="demo-legend" aria-label={i18n('intui.demo.colorScale', 'Color scale')}>
          <svg className="demo-color-scale" viewBox="0 0 120 10" aria-hidden="true">
            <defs>
              <linearGradient id={scaleId}>
                <stop offset="0%" stopColor="#000" />
                <stop offset="33.333%" stopColor="#f00" />
                <stop offset="66.667%" stopColor="#ff0" />
                <stop offset="100%" stopColor="#fff" />
              </linearGradient>
            </defs>
            <rect width="120" height="10" fill={`url(#${scaleId})`} />
          </svg>
          <span>{Number(sample.colorRange[0].toPrecision(4))} – {Number(sample.colorRange[1].toPrecision(4))} {view.unit && <MathText text={view.unit} />}</span>
        </div>
      ) : null}
      {sample?.contours?.length ? (
        <div className="demo-legend">
          <span>{i18n('intui.demo.contourLevels', 'Contour levels')}: {sample.contours.map(({ level }) => Number(level.toPrecision(4))).join(', ')} {view.unit && <MathText text={view.unit} />}</span>
        </div>
      ) : null}
      {problem ? (
        <div className="demo-note" role="status">
          <DemoIssue headline={headline} details={[problem]} />
        </div>
      ) : null}
    </figure>
  );
});

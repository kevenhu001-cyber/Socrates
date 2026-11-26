import { memo, useEffect, useId, useRef } from 'react';
import { DemoSurface } from './DemonstrationSurface';
import type { DemonstrationField } from '@socrates/core/demonstration';
import { i18n } from '../../../ui/legacyI18n.ts';
import { MathText } from '../../rn/useInlineMath';
import { DemoIssue } from './DemonstrationIssue';
import { FIELD_WIDTH, fieldHeight, type FieldSample } from './sampleField';

function drawVectorArrow(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  dx: number,
  dy: number,
): void {
  context.moveTo(x - dx, y - dy);
  context.lineTo(x + dx, y + dy);
  context.lineTo(x + dx - dx * 0.5 - dy * 0.4, y + dy - dy * 0.5 + dx * 0.4);
  context.moveTo(x + dx, y + dy);
  context.lineTo(x + dx - dx * 0.5 + dy * 0.4, y + dy - dy * 0.5 - dx * 0.4);
}

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
    context.putImageData(
      new ImageData(new Uint8ClampedArray(sample.pixels), FIELD_WIDTH, fieldHeight(view)),
      0,
      0,
    );
    if (sample.contours?.length) {
      context.beginPath();
      for (const { lines } of sample.contours)
        for (let i = 0; i < lines.length; i += 4) {
          context.moveTo(lines[i], lines[i + 1]);
          context.lineTo(lines[i + 2], lines[i + 3]);
        }
      context.strokeStyle = 'rgba(0,0,0,.65)';
      context.lineWidth = 2;
      context.stroke();
      context.strokeStyle = 'rgba(255,255,255,.88)';
      context.lineWidth = 0.9;
      context.stroke();
    }
    if(sample.streamlines?.length){
      context.beginPath();
      for(const line of sample.streamlines){
        context.moveTo(line[0],line[1]);for(let i=2;i<line.length;i+=2)context.lineTo(line[i],line[i+1]);
      }
      context.strokeStyle='rgba(0,0,0,.55)';context.lineWidth=1.8;context.stroke();
      context.strokeStyle='rgba(255,255,255,.8)';context.lineWidth=.8;context.stroke();
    }
    for(const marker of sample.markers??[]){
      context.beginPath();context.arc(marker.px,marker.py,4,0,2*Math.PI);context.fillStyle='#1b9a70';context.fill();context.strokeStyle='white';context.lineWidth=1.5;context.stroke();
    }
    if (!sample.arrows.length) return;
    context.strokeStyle = 'rgba(255,255,255,.72)';
    context.lineWidth = 0.7;
    context.beginPath();
    for (let i = 0; i < sample.arrows.length; i += 4)
      drawVectorArrow(
        context,
        sample.arrows[i],
        sample.arrows[i + 1],
        sample.arrows[i + 2],
        sample.arrows[i + 3],
      );
    context.stroke();
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
      {['surface','curve3d','vectors3d','parametricSurface','isosurface'].includes(view.presentation ?? '') ? (
        <DemoSurface sample={sample?.surface} label={view.label} style={view.surfaceStyle??(view.presentation==='isosurface'?'shaded':undefined)} />
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

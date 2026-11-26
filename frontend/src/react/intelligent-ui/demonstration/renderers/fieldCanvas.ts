import type { DemonstrationField } from '@socrates/core/demonstration';
import type { FieldSample } from '../sampleField';
import { FIELD_WIDTH, fieldHeight } from '../fieldCommon';

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

export function paintField(context:CanvasRenderingContext2D,view:DemonstrationField,sample:FieldSample){
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
}

import { MathText } from './useInlineMath';
import { mathLabelSource } from '../../render/latex';

/** HTML math inside an SVG coordinate system; ordinary ticks remain SVG text. */
export function SvgMathText({
  text,
  x,
  y,
  width = 160,
  anchor = 'start',
  rotate = 0,
  className,
}: {
  text: string;
  x: number;
  y: number;
  width?: number;
  anchor?: 'start' | 'middle' | 'end';
  /** Degrees around the anchor point; a rotated axis name reads along its axis. */
  rotate?: number;
  className?: string;
}) {
  const transform = rotate ? `rotate(${rotate} ${x} ${y})` : undefined;
  if (!mathLabelSource(text))
    return (
      <text x={x} y={y} textAnchor={anchor} transform={transform} className={className}>
        {text}
      </text>
    );
  const left = x - (anchor === 'end' ? width : anchor === 'middle' ? width / 2 : 0);
  return (
    <foreignObject
      x={left}
      y={y - 24}
      width={width}
      height={40}
      overflow="visible"
      transform={transform}
      className={className}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent:
            anchor === 'middle' ? 'center' : anchor === 'end' ? 'flex-end' : 'flex-start',
          height: '100%',
          whiteSpace: 'nowrap',
          color: 'inherit',
        }}
      >
        <MathText text={text} />
      </div>
    </foreignObject>
  );
}

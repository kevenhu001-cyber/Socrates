import { MathText } from './useInlineMath';

/** HTML math inside an SVG coordinate system; ordinary ticks remain SVG text. */
export function SvgMathText({ text, x, y, width = 160, anchor = 'start', className }: {
  text: string; x: number; y: number; width?: number;
  anchor?: 'start' | 'middle' | 'end'; className?: string;
}) {
  if (!/\$|\\[([]/.test(text)) return <text x={x} y={y} textAnchor={anchor} className={className}>{text}</text>;
  const left = x - (anchor === 'end' ? width : anchor === 'middle' ? width / 2 : 0);
  return <foreignObject x={left} y={y - 24} width={width} height={40} overflow="visible" className={className}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: anchor === 'middle' ? 'center' : anchor === 'end' ? 'flex-end' : 'flex-start', height: '100%', whiteSpace: 'nowrap', color: 'inherit' }}><MathText text={text} /></div>
  </foreignObject>;
}

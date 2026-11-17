import { ArrowRight, Check, ChevronDown, Copy, Info, Pause, Play, Plus, RotateCcw, X } from 'lucide-react';

const icons = { 'arrow-right': ArrowRight, check: Check, 'chevron-down': ChevronDown, copy: Copy, info: Info, pause: Pause, play: Play, plus: Plus, 'rotate-ccw': RotateCcw, x: X };

/** A small local icon registry keeps arbitrary icon names out of the boot graph. */
export function Glyph({ name, size = 18, className }: { name: unknown; size?: number; className?: string }) {
  const Icon = typeof name === 'string' ? icons[name as keyof typeof icons] : null;
  return Icon ? <Icon size={size} className={className} aria-hidden /> : null;
}

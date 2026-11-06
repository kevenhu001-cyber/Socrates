import { useEffect, useRef, useState, type PointerEvent, type MouseEvent } from 'react';

/** Long presses yield to scrolling and controls embedded in the message. */
export function useMessageContextMenu(enabled: boolean) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const cancel = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancel, []);
  const eligible = (target: EventTarget) => enabled && target instanceof Element
    && !target.closest('button,a,input,textarea,select,[contenteditable="true"],[role="button"],[role="menu"]');
  return {
    open, setOpen,
    handlers: {
      onPointerDown(event: PointerEvent<HTMLDivElement>) {
        cancel();
        if (event.pointerType === 'mouse' || !eligible(event.target)) return;
        origin.current = { x: event.clientX, y: event.clientY };
        timer.current = setTimeout(() => { timer.current = null; setOpen(true); }, 550);
      },
      onPointerMove(event: PointerEvent<HTMLDivElement>) {
        if (Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y) > 10) cancel();
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onContextMenu(event: MouseEvent<HTMLDivElement>) {
        if (!eligible(event.target)) return;
        event.preventDefault();
        cancel();
        setOpen(true);
      },
      onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
        if (!enabled || event.target !== event.currentTarget) return;
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          event.preventDefault();
          setOpen(true);
        }
      },
    },
  };
}

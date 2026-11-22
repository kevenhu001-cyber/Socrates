import { useEffect, useState } from 'react';

export interface WindowDimensions {
  width: number;
  height: number;
}

function read(): WindowDimensions {
  if (typeof window === 'undefined') return { width: 1024, height: 768 };
  return { width: window.innerWidth, height: window.innerHeight };
}

/** Web host adapter for the RN `useWindowDimensions` hook. */
export function useWindowDimensions(): WindowDimensions {
  const [size, setSize] = useState<WindowDimensions>(read);

  useEffect(() => {
    const update = () => setSize(read());
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return size;
}

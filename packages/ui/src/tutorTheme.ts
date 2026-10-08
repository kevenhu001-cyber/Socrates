/** Legacy Tutor/sidebar colors mirrored from frontend/src/styles/themes.css.
 * The Tutor widgets still use the frontend's --text-* / --bg-* channels,
 * whose contrast steps intentionally differ from the newer shared palette. */
export function getTutorLegacyPalette(mode: 'light' | 'dark') {
  if (mode === 'dark') {
    return {
      /* Measured SPA computed fill for `hsl(145 50% 50%)` (node + done marker). */
      accent: '#ffffff',
      success: '#40BF75',
      border: '#333333',
      bg: { sidebar: '#1e1e1e', raised: '#1f1f1f', soft: '#292929', card: '#1a1a1a' },
      text: { primary: '#e8e8e8', secondary: '#c4c4c4', tertiary: '#a6a6a6', caption: '#949494', muted: '#808080' },
      rgba: { accent08: 'rgba(255,255,255,0.08)', accent12: 'rgba(255,255,255,0.12)', soft80: 'rgba(41,41,41,0.8)' },
    } as const;
  }
  return {
    accent: '#1a1a1a',
    success: '#40BF75',
    border: '#cccccc',
    bg: { sidebar: '#ffffff', raised: '#fafafa', soft: '#f3f3f3', card: '#fcfcfc' },
    text: { primary: '#0d0d0d', secondary: '#3d3d3d', tertiary: '#5c5c5c', caption: '#6e6e6e', muted: '#737373' },
    rgba: { accent08: 'rgba(26,26,26,0.08)', accent12: 'rgba(26,26,26,0.12)', soft80: 'rgba(243,243,243,0.8)' },
  } as const;
}

export function tutorRgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const rgb = value.length === 3
    ? value.split('').map((channel) => parseInt(channel + channel, 16))
    : [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16));
  return `rgba(${rgb.join(',')},${alpha})`;
}

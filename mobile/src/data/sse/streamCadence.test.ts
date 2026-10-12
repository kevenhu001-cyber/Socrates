import { getMobileStreamRenderInterval } from './streamCadence';

describe('getMobileStreamRenderInterval', () => {
  it('keeps short answers responsive and matches the web paint cadence', () => {
    expect(getMobileStreamRenderInterval(0)).toBe(50);
    expect(getMobileStreamRenderInterval(1999)).toBe(50);
    expect(getMobileStreamRenderInterval(2000)).toBe(80);
    expect(getMobileStreamRenderInterval(7999)).toBe(80);
    expect(getMobileStreamRenderInterval(8000)).toBe(120);
  });

  it('treats missing or invalid lengths as a short live response', () => {
    expect(getMobileStreamRenderInterval(undefined)).toBe(50);
    expect(getMobileStreamRenderInterval(null)).toBe(50);
    expect(getMobileStreamRenderInterval(Number.NaN)).toBe(50);
    expect(getMobileStreamRenderInterval(-20)).toBe(50);
  });
});

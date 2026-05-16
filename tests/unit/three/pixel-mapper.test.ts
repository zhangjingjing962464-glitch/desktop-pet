import { describe, it, expect } from 'vitest';
import { buildPixelMapper } from '../../../src/renderer/three/pixel-mapper.js';
import type { DisplayMetrics } from '../../../src/shared/ipc/contracts.js';

const retina: DisplayMetrics = {
  scaleFactor: 2,
  workAreaSize: { width: 1440, height: 900 },
  size: { width: 1440, height: 900 },
  estimatedPpi: 220,
};

const external: DisplayMetrics = {
  scaleFactor: 1,
  workAreaSize: { width: 1920, height: 1080 },
  size: { width: 1920, height: 1080 },
  estimatedPpi: 96,
};

describe('pixel-mapper', () => {
  it('retina 3cm ≈ 260px', () => {
    const m = buildPixelMapper(retina);
    expect(m.cmToPx(3)).toBe(260);
  });

  it('external 3cm ≈ 113px', () => {
    const m = buildPixelMapper(external);
    expect(m.cmToPx(3)).toBe(113);
  });

  it('round-trip cmToPx then pxToCm', () => {
    const m = buildPixelMapper(retina);
    const px = m.cmToPx(5);
    const cmBack = m.pxToCm(px);
    expect(cmBack).toBeCloseTo(5, 1);
  });
});

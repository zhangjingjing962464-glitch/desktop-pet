// CSS px <-> 世界坐标换算

import type { DisplayMetrics } from '@shared/ipc/contracts.js';

export interface PixelMapper {
  readonly dpr: number;
  readonly ppi: number;
  cmToPx(cm: number): number;
  pxToCm(px: number): number;
}

export function buildPixelMapper(metrics: DisplayMetrics): PixelMapper {
  return {
    dpr: metrics.scaleFactor,
    ppi: metrics.estimatedPpi,
    cmToPx(cm: number): number {
      return Math.round((cm / 2.54) * metrics.estimatedPpi);
    },
    pxToCm(px: number): number {
      return (px * 2.54) / metrics.estimatedPpi;
    },
  };
}

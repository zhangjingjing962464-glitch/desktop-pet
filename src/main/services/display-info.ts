// 屏幕信息：获取主屏 PPI 与几何信息

import { screen } from 'electron';
import type { DisplayMetrics } from '@shared/ipc/contracts.js';
import { DEFAULT_PPI_RETINA, DEFAULT_PPI_EXTERNAL } from '@shared/constants/physical.js';

/** 估算 PPI：scaleFactor >= 2 视作 Retina (220 PPI)，否则外接监视器 (96 PPI) */
function estimatePpi(scaleFactor: number): number {
  return scaleFactor >= 2 ? DEFAULT_PPI_RETINA : DEFAULT_PPI_EXTERNAL;
}

export function getPrimaryDisplayMetrics(): DisplayMetrics {
  const display = screen.getPrimaryDisplay();
  return {
    scaleFactor: display.scaleFactor,
    workAreaSize: { width: display.workAreaSize.width, height: display.workAreaSize.height },
    size: { width: display.size.width, height: display.size.height },
    estimatedPpi: estimatePpi(display.scaleFactor),
  };
}

/** 获取主屏中央坐标（CSS px） */
export function getPrimaryDisplayCenter(): { x: number; y: number } {
  const display = screen.getPrimaryDisplay();
  return {
    x: display.bounds.x + Math.round(display.workAreaSize.width / 2),
    y: display.bounds.y + Math.round(display.workAreaSize.height / 2),
  };
}

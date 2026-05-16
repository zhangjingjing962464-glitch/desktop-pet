// 点击 vs 拖拽 判定：位移 > 4px 或 时长 > 250ms → 拖拽，否则点击

import { DRAG_THRESHOLD_PX, DRAG_THRESHOLD_MS } from '@shared/constants/time.js';

export interface PressBookkeeping {
  startX: number;
  startY: number;
  startT: number;
}

export interface MouseSample {
  x: number;
  y: number;
  t: number;
}

export function isStillClick(p: PressBookkeeping, now: MouseSample): boolean {
  const dx = now.x - p.startX;
  const dy = now.y - p.startY;
  const dt = now.t - p.startT;
  return Math.hypot(dx, dy) < DRAG_THRESHOLD_PX && dt < DRAG_THRESHOLD_MS;
}

export function exceededDragThreshold(p: PressBookkeeping, now: MouseSample): boolean {
  return !isStillClick(p, now);
}

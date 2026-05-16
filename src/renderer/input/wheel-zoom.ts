// 滚轮缩放：归一化 deltaY（macOS trackpad vs Windows mouse），2-8cm

import { MIN_SIZE_CM, MAX_SIZE_CM, SIZE_STEP_CM } from '@shared/constants/physical.js';
import { clamp } from '@shared/utils/math.js';

type ChangeCb = (cm: number) => void;

export class WheelZoom {
  private currentCm: number;
  private readonly callbacks = new Set<ChangeCb>();

  constructor(initialCm: number) {
    this.currentCm = clamp(initialCm, MIN_SIZE_CM, MAX_SIZE_CM);
  }

  attach(target: HTMLElement | Window): () => void {
    const handler = (ev: Event): void => this.onWheel(ev as WheelEvent);
    target.addEventListener('wheel', handler, { passive: false });
    return () => target.removeEventListener('wheel', handler);
  }

  private onWheel(ev: WheelEvent): void {
    ev.preventDefault();
    // deltaY 归一化：mouse wheel 通常 ±100，trackpad ±1~5
    const step = Math.sign(ev.deltaY) * SIZE_STEP_CM * (Math.abs(ev.deltaY) >= 30 ? 1 : 0.5);
    // 滚轮向下（deltaY>0）通常表示缩小
    const next = clamp(this.currentCm - step, MIN_SIZE_CM, MAX_SIZE_CM);
    if (Math.abs(next - this.currentCm) < 0.001) return;
    this.currentCm = next;
    for (const cb of this.callbacks) cb(this.currentCm);
  }

  onChange(cb: ChangeCb): () => void {
    this.callbacks.add(cb);
    return () => this.callbacks.delete(cb);
  }

  setSizeCm(cm: number): void {
    const next = clamp(cm, MIN_SIZE_CM, MAX_SIZE_CM);
    if (Math.abs(next - this.currentCm) < 0.001) return;
    this.currentCm = next;
    for (const cb of this.callbacks) cb(this.currentCm);
  }

  getSizeCm(): number {
    return this.currentCm;
  }
}

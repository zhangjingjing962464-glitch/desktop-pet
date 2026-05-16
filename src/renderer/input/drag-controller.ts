// 拖拽窗口：mousedown 进入 dragging，mousemove 节流 60Hz 调 IPC 更新窗口位置

import { exceededDragThreshold, type PressBookkeeping } from './click-vs-drag.js';

type DragCb = (info: { dragging: boolean }) => void;

export class DragController {
  private press: PressBookkeeping | null = null;
  private dragging = false;
  private lastPosTs = 0;
  /** mousedown 时窗口屏幕坐标 */
  private winStartScreen: { x: number; y: number } | null = null;
  /** mousedown 时鼠标屏幕坐标 */
  private mouseStartScreen: { x: number; y: number } | null = null;
  private readonly cbs = new Set<DragCb>();

  attach(target: HTMLElement | Window): () => void {
    const onDown = (e: Event): void => this.onMouseDown(e as MouseEvent);
    const onMove = (e: Event): void => this.onMouseMove(e as MouseEvent);
    const onUp = (e: Event): void => this.onMouseUp(e as MouseEvent);
    target.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      target.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }

  isDragging(): boolean {
    return this.dragging;
  }

  onChange(cb: DragCb): () => void {
    this.cbs.add(cb);
    return () => this.cbs.delete(cb);
  }

  private onMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return;
    this.press = { startX: e.clientX, startY: e.clientY, startT: performance.now() };
    this.mouseStartScreen = { x: e.screenX, y: e.screenY };
    this.winStartScreen = { x: window.screenX, y: window.screenY };
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.press || !this.mouseStartScreen || !this.winStartScreen) return;
    const now = { x: e.clientX, y: e.clientY, t: performance.now() };
    if (!this.dragging && exceededDragThreshold(this.press, now)) {
      this.dragging = true;
      for (const cb of this.cbs) cb({ dragging: true });
    }
    if (this.dragging) {
      // 60Hz 节流
      if (now.t - this.lastPosTs < 1000 / 60) return;
      this.lastPosTs = now.t;
      const dx = e.screenX - this.mouseStartScreen.x;
      const dy = e.screenY - this.mouseStartScreen.y;
      void window.pet.window.setPosition({
        x: this.winStartScreen.x + dx,
        y: this.winStartScreen.y + dy,
      });
    }
  }

  private onMouseUp(_e: MouseEvent): void {
    if (this.dragging) {
      this.dragging = false;
      for (const cb of this.cbs) cb({ dragging: false });
    }
    this.press = null;
    this.mouseStartScreen = null;
    this.winStartScreen = null;
  }
}

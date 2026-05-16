// 把"未升级为拖拽"的 mouseup 视作点击，触发回调

import { isStillClick, type PressBookkeeping } from './click-vs-drag.js';

export class ClickRouter {
  private press: PressBookkeeping | null = null;
  private cb: (() => void) | null = null;
  private wasDragging = false;

  attach(target: HTMLElement | Window): () => void {
    const onDown = (e: Event): void => this.onMouseDown(e as MouseEvent);
    const onUp = (e: Event): void => this.onMouseUp(e as MouseEvent);
    target.addEventListener('mousedown', onDown);
    target.addEventListener('mouseup', onUp);
    return () => {
      target.removeEventListener('mousedown', onDown);
      target.removeEventListener('mouseup', onUp);
    };
  }

  setDragging(dragging: boolean): void {
    if (dragging) this.wasDragging = true;
  }

  onClick(cb: () => void): void {
    this.cb = cb;
  }

  private onMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return;
    this.press = { startX: e.clientX, startY: e.clientY, startT: performance.now() };
    this.wasDragging = false;
  }

  private onMouseUp(e: MouseEvent): void {
    if (e.button !== 0) return;
    if (!this.press) return;
    const now = { x: e.clientX, y: e.clientY, t: performance.now() };
    const click = isStillClick(this.press, now) && !this.wasDragging;
    this.press = null;
    if (click && this.cb) this.cb();
  }
}

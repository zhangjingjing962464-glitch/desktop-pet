// 鼠标位置主动轮询：用 screen.getCursorScreenPoint() 替代 renderer mousemove
// 解决长时间运行后 setIgnoreMouseEvents forward 在 macOS 不稳定导致鼠标失控

import { type BrowserWindow, screen } from 'electron';
import { IPC } from '@shared/ipc/channels.js';

const POLL_INTERVAL_MS = 50;

export class CursorPoller {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly getWin: () => BrowserWindow | null) {}

  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => this.tick(), POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private tick(): void {
    const win = this.getWin();
    if (!win || win.isDestroyed() || !win.isVisible()) return;
    const cursor = screen.getCursorScreenPoint();
    const b = win.getContentBounds();
    const x = cursor.x - b.x;
    const y = cursor.y - b.y;
    win.webContents.send(IPC.cursor.update, { x, y });
  }
}

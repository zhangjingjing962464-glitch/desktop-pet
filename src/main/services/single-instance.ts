// 单例锁：第二次启动时唤起首个实例并退出

import { app, BrowserWindow } from 'electron';

export function acquireSingleInstanceLock(): boolean {
  return app.requestSingleInstanceLock();
}

export function bindSecondInstanceFocus(getWindow: () => BrowserWindow | null): void {
  app.on('second-instance', () => {
    const win = getWindow();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
}

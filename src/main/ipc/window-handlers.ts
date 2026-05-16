// 窗口控制 IPC handlers

import { ipcMain, type BrowserWindow } from 'electron';
import { IPC } from '@shared/ipc/channels.js';
import type {
  SetWindowSizePayload,
  SetWindowPositionPayload,
  SetIgnoreMousePayload,
} from '@shared/ipc/contracts.js';
import { openSettingsWindow } from '../windows/settings-window.js';

export function registerWindowHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC.window.setSize, (_e, p: SetWindowSizePayload) => {
    const win = getMainWindow();
    if (!win) return;
    const [cx, cy] = win.getBounds() ? [win.getBounds().x + win.getBounds().width / 2, win.getBounds().y + win.getBounds().height / 2] : [0, 0];
    const anchor = p.anchor ?? 'center';
    if (anchor === 'center') {
      win.setBounds({
        x: Math.round(cx - p.widthPx / 2),
        y: Math.round(cy - p.heightPx / 2),
        width: p.widthPx,
        height: p.heightPx,
      });
    } else {
      win.setSize(p.widthPx, p.heightPx);
    }
  });

  ipcMain.handle(IPC.window.setPosition, (_e, p: SetWindowPositionPayload) => {
    const win = getMainWindow();
    win?.setPosition(Math.round(p.x), Math.round(p.y));
  });

  ipcMain.handle(IPC.window.setIgnoreMouse, (_e, p: SetIgnoreMousePayload) => {
    const win = getMainWindow();
    if (!win) return;
    win.setIgnoreMouseEvents(p.ignore, p.forward !== undefined ? { forward: p.forward } : undefined);
  });

  ipcMain.handle(IPC.window.setAlwaysOnTop, (_e, on: boolean) => {
    // on=true：最顶层（screen-saver level，在所有普通窗口之上）
    // on=false：取消置顶（被其他获焦窗口盖住，体感上"最底层"）。
    //   注：Electron TypeScript 类型不含 'desktop' level，不能真正放到桌面壁纸层
    //   （需要 BrowserWindow 构造时 type:'desktop'，无法运行时切换），用 false 近似
    const win = getMainWindow();
    if (!win) return;
    if (on) win.setAlwaysOnTop(true, 'screen-saver');
    else win.setAlwaysOnTop(false);
  });

  ipcMain.handle(IPC.window.focus, () => {
    const win = getMainWindow();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });

  ipcMain.handle(IPC.window.openSettings, () => {
    openSettingsWindow();
  });
}

// 窗口控制 IPC handlers

import { ipcMain, type BrowserWindow } from 'electron';
import { IPC } from '@shared/ipc/channels.js';
import type {
  SetWindowSizePayload,
  SetWindowPositionPayload,
  SetIgnoreMousePayload,
} from '@shared/ipc/contracts.js';
import { MODEL_FEET_VIEWPORT_RATIO } from '@shared/constants/physical.js';

export function registerWindowHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC.window.setSize, (_e, p: SetWindowSizePayload) => {
    const win = getMainWindow();
    if (!win) return;
    const b = win.getBounds();
    const anchor = p.anchor ?? 'center';
    if (anchor === 'center') {
      // x: 中心对齐（模型水平居中，与窗口几何中心一致）
      // y: 脚底位置对齐（模型脚底在画布 MODEL_FEET_VIEWPORT_RATIO 处，
      //    与窗口几何中心不重合；如果按中心对齐会让脚底随窗口大小变化漂移）
      // animate=true: macOS 原生窗口动画，把"瞬时跳变"分摊到多帧平滑过渡，
      //    每帧 ResizeObserver 触发 fit() 同步 drawingBuffer，消除单帧跳闪
      const feetY = b.y + b.height * MODEL_FEET_VIEWPORT_RATIO;
      win.setBounds({
        x: Math.round(b.x + b.width / 2 - p.widthPx / 2),
        y: Math.round(feetY - p.heightPx * MODEL_FEET_VIEWPORT_RATIO),
        width: p.widthPx,
        height: p.heightPx,
      }, true);
    } else {
      win.setSize(p.widthPx, p.heightPx, true);
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
}

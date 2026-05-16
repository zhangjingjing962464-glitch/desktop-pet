// 显示信息 IPC handlers

import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc/channels.js';
import { getPrimaryDisplayMetrics } from '../services/display-info.js';

export function registerDisplayHandlers(): void {
  ipcMain.handle(IPC.display.getMetrics, () => getPrimaryDisplayMetrics());
}

// 通知 IPC handlers

import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc/channels.js';
import type { NotifyPayload } from '@shared/ipc/contracts.js';
import { Notifier } from '../services/notifier.js';

export function registerNotifyHandlers(notifier: Notifier): void {
  ipcMain.handle(IPC.notify.show, (_e, p: NotifyPayload) => notifier.notify(p));
}

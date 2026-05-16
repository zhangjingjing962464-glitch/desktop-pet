// reminder IPC handlers

import { ipcMain, type BrowserWindow } from 'electron';
import { IPC } from '@shared/ipc/channels.js';
import type { WorkRestScheduler } from '../reminder/work-rest-scheduler.js';
import type { SettingsStore } from '../services/store.js';

interface Deps {
  scheduler: WorkRestScheduler;
  store: SettingsStore;
  getMainWindow: () => BrowserWindow | null;
}

export function registerReminderHandlers(deps: Deps): void {
  ipcMain.handle(IPC.reminder.state, () => deps.scheduler.getState());
  ipcMain.handle(IPC.reminder.skipRest, () => deps.scheduler.skipRest());
  ipcMain.handle(IPC.reminder.pauseAll, (_e, paused: boolean) => {
    deps.store.patch({ remindersPaused: paused });
  });
}

/** 把 reminder 事件推送给 renderer（非典型的 invoke 模型；用 send） */
export function pushReminderState(
  win: BrowserWindow | null,
  state: { state: string; remainingMs: number },
): void {
  win?.webContents.send(IPC.reminder.state, state);
}

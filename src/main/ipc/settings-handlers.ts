// 设置 IPC handlers

import { ipcMain, BrowserWindow } from 'electron';
import { IPC } from '@shared/ipc/channels.js';
import type { UserSettings } from '@shared/domain/settings.js';
import { SettingsStore } from '../services/store.js';
import { createLogger } from '@shared/utils/logger.js';

const log = createLogger('settings-handlers');

export function registerSettingsHandlers(store: SettingsStore): void {
  ipcMain.handle(IPC.settings.get, () => store.get());
  ipcMain.handle(IPC.settings.patch, (_e, partial: Partial<UserSettings>) => store.patch(partial));

  // 把变更广播给所有窗口
  store.onChange((next) => {
    const wins = BrowserWindow.getAllWindows();
    log.info(`[trace] broadcast settings.onChange selectedCharacterId=${next.selectedCharacterId} to ${wins.length} window(s)`);
    for (const win of wins) {
      win.webContents.send(IPC.settings.onChange, next);
    }
  });
}

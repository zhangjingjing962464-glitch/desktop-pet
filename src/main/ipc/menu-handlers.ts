// 右键菜单 IPC handler

import { ipcMain, type BrowserWindow } from 'electron';
import { IPC } from '@shared/ipc/channels.js';
import type { ContextMenuResult } from '@shared/ipc/contracts.js';
import type { UserSettings } from '@shared/domain/settings.js';
import { popupContextMenu } from '../services/menu.js';
import type { SettingsStore } from '../services/store.js';
import { createLogger } from '@shared/utils/logger.js';

const log = createLogger('menu-handlers');

interface Deps {
  getMainWindow: () => BrowserWindow | null;
  store: SettingsStore;
  onSwitchCharacter: (id: string) => void;
}

export function registerMenuHandlers(deps: Deps): void {
  ipcMain.handle(IPC.menu.popupContext, () => {
    log.info('[trace] popupContext invoked');
    const win = deps.getMainWindow();
    if (!win) return;
    popupContextMenu(win, {
      getCurrentCharacter: () => deps.store.get().selectedCharacterId,
      getTheme: () => deps.store.get().theme,
      isWindowOnTop: () => deps.store.get().windowOnTop,
      onSwitchCharacter: (id) => {
        log.info(`[trace] onSwitchCharacter clicked id=${id}`);
        deps.onSwitchCharacter(id);
        const result: ContextMenuResult = { type: 'switch-character', characterId: id };
        win.webContents.send(IPC.menu.onResult, result);
      },
      onSetTheme: (theme: UserSettings['theme']) => {
        deps.store.patch({ theme });
        log.info(`theme changed → ${theme}`);
      },
      onToggleWindowOnTop: () => {
        const next = !deps.store.get().windowOnTop;
        deps.store.patch({ windowOnTop: next });
        // 立即同步到窗口（不依赖 renderer 监听 settings 变更）
        if (next) win.setAlwaysOnTop(true, 'screen-saver');
        else win.setAlwaysOnTop(false);
        log.info(`window on-top toggled → ${next}`);
      },
    });
  });
}

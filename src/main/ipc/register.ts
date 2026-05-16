// 集中注册所有 IPC handler

import type { BrowserWindow } from 'electron';
import { registerWindowHandlers } from './window-handlers.js';
import { registerSettingsHandlers } from './settings-handlers.js';
import { registerDisplayHandlers } from './display-handlers.js';
import { registerCharacterHandlers } from './character-handlers.js';
import { registerNotifyHandlers } from './notify-handlers.js';
import { registerMenuHandlers } from './menu-handlers.js';
import { registerReminderHandlers } from './reminder-handlers.js';
import { registerDialogHandlers } from './dialog-handlers.js';
import type { SettingsStore } from '../services/store.js';
import type { Notifier } from '../services/notifier.js';
import type { WorkRestScheduler } from '../reminder/work-rest-scheduler.js';

interface Deps {
  getMainWindow: () => BrowserWindow | null;
  store: SettingsStore;
  notifier: Notifier;
  workRest: WorkRestScheduler;
  onSwitchCharacter: (id: string) => void;
  onOpenSettings: () => void;
}

export function registerAllIpc(deps: Deps): void {
  registerWindowHandlers(deps.getMainWindow);
  registerSettingsHandlers(deps.store);
  registerDisplayHandlers();
  registerCharacterHandlers();
  registerNotifyHandlers(deps.notifier);
  registerMenuHandlers({
    getMainWindow: deps.getMainWindow,
    store: deps.store,
    onSwitchCharacter: deps.onSwitchCharacter,
    onOpenSettings: deps.onOpenSettings,
  });
  registerReminderHandlers({
    scheduler: deps.workRest,
    store: deps.store,
    getMainWindow: deps.getMainWindow,
  });
  registerDialogHandlers(deps.getMainWindow);
}

// 集中注册所有 IPC handler

import type { BrowserWindow } from 'electron';
import { registerWindowHandlers } from './window-handlers.js';
import { registerSettingsHandlers } from './settings-handlers.js';
import { registerDisplayHandlers } from './display-handlers.js';
import { registerCharacterHandlers } from './character-handlers.js';
import { registerMenuHandlers } from './menu-handlers.js';
import type { SettingsStore } from '../services/store.js';

interface Deps {
  getMainWindow: () => BrowserWindow | null;
  store: SettingsStore;
  onSwitchCharacter: (id: string) => void;
}

export function registerAllIpc(deps: Deps): void {
  registerWindowHandlers(deps.getMainWindow);
  registerSettingsHandlers(deps.store);
  registerDisplayHandlers();
  registerCharacterHandlers();
  registerMenuHandlers({
    getMainWindow: deps.getMainWindow,
    store: deps.store,
    onSwitchCharacter: deps.onSwitchCharacter,
  });
}

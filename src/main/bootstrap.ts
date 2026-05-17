// 应用启动装配

import { app, BrowserWindow } from 'electron';
import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createMainWindow } from './windows/main-window.js';
import { SettingsStore } from './services/store.js';
import { registerAllIpc } from './ipc/register.js';
import { acquireSingleInstanceLock, bindSecondInstanceFocus } from './services/single-instance.js';
import {
  registerAssetSchemeAsPrivileged,
  registerAssetProtocolHandler,
} from './services/asset-protocol.js';
import { createTray, destroyTray } from './services/tray.js';
import { ShortcutsManager } from './services/shortcuts.js';
import { CursorPoller } from './services/cursor-poller.js';
import { createLogger } from '@shared/utils/logger.js';

const log = createLogger('bootstrap');

let mainWindow: BrowserWindow | null = null;

/** 把 console.warn / .error 同时落盘到 ~/Library/Logs/desktop-pet/main.log，便于 prod 排查 */
function installFileLogger(): void {
  try {
    const dir = join(app.getPath('logs')); // macOS: ~/Library/Logs/桌面小小英雄/
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const file = join(dir, 'main.log');
    const origWarn = console.warn;
    const origError = console.error;
    const writeLine = (level: string, args: unknown[]): void => {
      try {
        const line = `[${new Date().toISOString()}][${level}] ${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`;
        appendFileSync(file, line, 'utf-8');
      } catch {
        // 写日志失败不影响主流程
      }
    };
    console.warn = (...args: unknown[]) => {
      writeLine('WARN', args);
      origWarn.apply(console, args as []);
    };
    console.error = (...args: unknown[]) => {
      writeLine('ERROR', args);
      origError.apply(console, args as []);
    };
    writeLine('INFO', [`logger started: ${file}`]);
  } catch (err) {
    // 不影响启动
    void err;
  }
}

export async function bootstrap(): Promise<void> {
  if (!acquireSingleInstanceLock()) {
    log.info('已有实例运行，退出当前进程');
    app.quit();
    return;
  }

  bindSecondInstanceFocus(() => mainWindow);

  registerAssetSchemeAsPrivileged();

  await app.whenReady();
  installFileLogger();
  log.info('app ready');

  registerAssetProtocolHandler();

  const store = new SettingsStore();

  const onSwitchCharacter = (id: string): void => {
    log.info(`[trace] bootstrap.onSwitchCharacter id=${id}`);
    try {
      const next = store.patch({ selectedCharacterId: id });
      log.info(`[trace] bootstrap.onSwitchCharacter patch done, next.selectedCharacterId=${next.selectedCharacterId}`);
    } catch (err) {
      log.error('[trace] bootstrap.onSwitchCharacter patch threw', err);
    }
  };

  registerAllIpc({
    getMainWindow: () => mainWindow,
    store,
    onSwitchCharacter,
  });

  const settings = store.get();
  mainWindow = createMainWindow({
    windowOnTop: settings.windowOnTop,
    ...(settings.windowPosition ? { position: settings.windowPosition } : {}),
  });

  if (process.platform === 'darwin') {
    app.dock?.hide();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 鼠标位置主动轮询（用 screen.getCursorScreenPoint 替代 mousemove，
  // 解决 macOS 上 setIgnoreMouseEvents forward 长时间运行失效导致的鼠标死锁）
  const cursorPoller = new CursorPoller(() => mainWindow);
  mainWindow.webContents.once('did-finish-load', () => cursorPoller.start());

  // 托盘
  createTray({
    getMainWindow: () => mainWindow,
    store,
    onSwitchCharacter,
  });

  // 全局快捷键
  const shortcuts = new ShortcutsManager(store, {
    toggleVisible: () => {
      const win = mainWindow;
      if (!win) return;
      if (win.isVisible()) win.hide();
      else {
        win.show();
        win.focus();
      }
    },
  });
  shortcuts.register();

  app.on('will-quit', () => {
    shortcuts.unregister();
    destroyTray();
    cursorPoller.stop();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (mainWindow === null) {
      const s = store.get();
      mainWindow = createMainWindow({
        windowOnTop: s.windowOnTop,
        ...(s.windowPosition ? { position: s.windowPosition } : {}),
      });
    }
  });
}

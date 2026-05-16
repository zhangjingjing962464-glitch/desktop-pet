// 应用启动装配

import { app, BrowserWindow, screen } from 'electron';
import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createMainWindow } from './windows/main-window.js';
import { openSettingsWindow } from './windows/settings-window.js';
import { SettingsStore } from './services/store.js';
import { Notifier } from './services/notifier.js';
import { registerAllIpc } from './ipc/register.js';
import { acquireSingleInstanceLock, bindSecondInstanceFocus } from './services/single-instance.js';
import {
  registerAssetSchemeAsPrivileged,
  registerAssetProtocolHandler,
} from './services/asset-protocol.js';
import { WorkRestScheduler } from './reminder/work-rest-scheduler.js';
import { MealScheduler } from './reminder/meal-scheduler.js';
import { createTray, destroyTray } from './services/tray.js';
import { ShortcutsManager } from './services/shortcuts.js';
import { IPC } from '@shared/ipc/channels.js';
import { cmToPx, computeWindowPx, REST_SCALE_MULTIPLIER } from '@shared/constants/physical.js';
import { createLogger } from '@shared/utils/logger.js';

const log = createLogger('bootstrap');

let mainWindow: BrowserWindow | null = null;
let lastNormalBounds: { x: number; y: number; width: number; height: number } | null = null;

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

function ppi(): number {
  const d = screen.getPrimaryDisplay();
  return d.scaleFactor >= 2 ? 220 : 96;
}

/** 进入休息：仅当 reminderShowOffEnabled=true 时让模型变最大、切到最顶层、播招牌动作；
 *  reminderSoundEnabled 是独立开关（在 notifier.notify 已处理），此处不参与 */
function enterRestingWindow(store: SettingsStore): void {
  const win = mainWindow;
  if (!win) return;
  if (!store.get().reminderShowOffEnabled) return; // 招牌动作未开则不动窗口

  lastNormalBounds = win.getBounds();
  const display = screen.getPrimaryDisplay();
  win.setBounds({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.size.width,
    height: display.size.height,
  });
  // 切到最顶层以确保用户看见招牌动作
  win.setAlwaysOnTop(true, 'screen-saver');
  win.webContents.send(IPC.reminder.onEnterResting);
}

/** 退出休息：还原大小，并按 settings.windowOnTop 恢复原层级 */
function exitRestingWindow(store: SettingsStore): void {
  const win = mainWindow;
  if (!win) return;
  if (!store.get().reminderShowOffEnabled) return;

  const settings = store.get();
  const modelPx = cmToPx(settings.sizeCm, ppi());
  const totalPx = computeWindowPx(modelPx);
  if (lastNormalBounds) {
    win.setBounds({
      x: lastNormalBounds.x,
      y: lastNormalBounds.y,
      width: totalPx,
      height: totalPx,
    });
  } else {
    win.setSize(totalPx, totalPx);
  }
  // 恢复原窗口层级
  if (settings.windowOnTop) win.setAlwaysOnTop(true, 'screen-saver');
  else win.setAlwaysOnTop(false);
  win.webContents.send(IPC.reminder.onExitResting);
  // 防 unused 警告
  void REST_SCALE_MULTIPLIER;
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
  const notifier = new Notifier();

  const workRest = new WorkRestScheduler(store, notifier, {
    onEnterResting: () => enterRestingWindow(store),
    onExitResting: () => exitRestingWindow(store),
  });

  const meal = new MealScheduler(store, notifier, {
    onMealTrigger: (mealKey) => {
      mainWindow?.webContents.send(IPC.reminder.onMealTrigger, mealKey);
    },
  });

  registerAllIpc({
    getMainWindow: () => mainWindow,
    store,
    notifier,
    workRest,
    onSwitchCharacter: (id: string) => {
      log.info(`[trace] bootstrap.onSwitchCharacter id=${id}`);
      try {
        const next = store.patch({ selectedCharacterId: id });
        log.info(`[trace] bootstrap.onSwitchCharacter patch done, next.selectedCharacterId=${next.selectedCharacterId}`);
      } catch (err) {
        log.error('[trace] bootstrap.onSwitchCharacter patch threw', err);
      }
    },
    onOpenSettings: () => {
      openSettingsWindow();
    },
  });

  const settings = store.get();
  mainWindow = createMainWindow({
    sizeCm: settings.sizeCm,
    windowOnTop: settings.windowOnTop,
    ...(settings.windowPosition ? { position: settings.windowPosition } : {}),
  });

  if (process.platform === 'darwin') {
    app.dock?.hide();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  setTimeout(() => notifier.ensurePermission(), 1500);

  // 主窗口加载完成后启动调度
  mainWindow.webContents.once('did-finish-load', () => {
    workRest.start();
    meal.start();
    log.info('schedulers started');
  });

  // 托盘
  createTray({
    getMainWindow: () => mainWindow,
    isPaused: () => store.get().remindersPaused,
    onTogglePause: () => {
      const next = !store.get().remindersPaused;
      store.patch({ remindersPaused: next });
      return next;
    },
    onOpenSettings: () => openSettingsWindow(),
  });

  // 全局快捷键
  const shortcuts = new ShortcutsManager(store, {
    pauseReminders: () => {
      const next = !store.get().remindersPaused;
      store.patch({ remindersPaused: next });
    },
    toggleVisible: () => {
      const win = mainWindow;
      if (!win) return;
      if (win.isVisible()) win.hide();
      else {
        win.show();
        win.focus();
      }
    },
    openSettings: () => openSettingsWindow(),
  });
  shortcuts.register();

  app.on('will-quit', () => {
    shortcuts.unregister();
    destroyTray();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (mainWindow === null) {
      const s = store.get();
      mainWindow = createMainWindow({
        sizeCm: s.sizeCm,
        windowOnTop: s.windowOnTop,
        ...(s.windowPosition ? { position: s.windowPosition } : {}),
      });
    }
  });
}

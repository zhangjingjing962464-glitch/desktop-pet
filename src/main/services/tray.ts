// 系统托盘（macOS 状态栏）

import { Tray, Menu, BrowserWindow, app, nativeImage } from 'electron';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { createLogger } from '@shared/utils/logger.js';

const log = createLogger('tray');
const __dirname = dirname(fileURLToPath(import.meta.url));

let tray: Tray | null = null;

interface TrayDeps {
  getMainWindow: () => BrowserWindow | null;
  onTogglePause: () => boolean; // 返回新的暂停状态
  isPaused: () => boolean;
  onOpenSettings: () => void;
}

function findIconPath(): string | null {
  const candidates = [
    resolve(__dirname, '../../assets/icons/tray.png'),
    resolve(process.cwd(), 'assets/icons/tray.png'),
    resolve(process.resourcesPath ?? '', 'icons/tray.png'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

export function createTray(deps: TrayDeps): Tray | null {
  if (tray) return tray;

  const iconPath = findIconPath();
  // 无图标时用空 image，托盘仍会出现，显示文字 fallback
  const image = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  if (iconPath) {
    image.setTemplateImage(true);
  }

  try {
    tray = new Tray(image);
  } catch (err) {
    log.warn('createTray failed', err);
    return null;
  }

  tray.setToolTip('桌面小小英雄');
  if (!iconPath) tray.setTitle('小');

  const rebuild = (): void => {
    const menu = Menu.buildFromTemplate([
      {
        label: '显示/聚焦',
        click: () => {
          const win = deps.getMainWindow();
          if (!win) return;
          if (win.isMinimized()) win.restore();
          win.show();
          win.focus();
        },
      },
      {
        label: deps.isPaused() ? '恢复提醒' : '暂停提醒',
        click: () => {
          deps.onTogglePause();
          rebuild();
        },
      },
      { type: 'separator' },
      { label: '设置...', click: () => deps.onOpenSettings() },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() },
    ]);
    tray?.setContextMenu(menu);
  };

  rebuild();
  return tray;
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
}

// 设置面板独立窗口

import { BrowserWindow } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { createLogger } from '@shared/utils/logger.js';

const log = createLogger('settings-window');
const __dirname = dirname(fileURLToPath(import.meta.url));

function resolvePreloadPath(): string {
  const candidates = [
    resolve(__dirname, '../preload/index.cjs'),
    resolve(__dirname, '../preload/index.js'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0] ?? '';
}

function resolveSettingsHtml(): { url?: string; file?: string } {
  const devUrl = process.env['VITE_DEV_SERVER_URL'];
  if (devUrl) return { url: `${devUrl}settings/index.html` };
  const file = resolve(__dirname, '../../dist/settings/index.html');
  return { file };
}

let settingsWin: BrowserWindow | null = null;

export function openSettingsWindow(): BrowserWindow {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return settingsWin;
  }

  const isMac = process.platform === 'darwin';
  const win = new BrowserWindow({
    width: 720,
    height: 560,
    title: '桌面小小英雄 设置',
    minWidth: 600,
    minHeight: 480,
    // macOS：背景透明 + 系统 vibrancy 接管底色（dark/light 自动适配，resize 不闪白）
    backgroundColor: isMac ? '#00000000' : '#f5f5f7',
    ...(isMac
      ? {
          vibrancy: 'under-window' as const,
          visualEffectState: 'active' as const,
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 14, y: 16 },
        }
      : { titleBarStyle: 'default' as const }),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: resolvePreloadPath(),
    },
  });

  const target = resolveSettingsHtml();
  if (target.url) void win.loadURL(target.url);
  else if (target.file) void win.loadFile(target.file);

  if (process.env['VITE_DEV_SERVER_URL']) {
    win.webContents.on('console-message', (_e, level, message, line) => {
      log.info(`[settings:console:${level}] ${message} (line ${line})`);
    });
  }

  win.on('closed', () => {
    settingsWin = null;
  });

  settingsWin = win;
  return win;
}

// 主窗口：透明、无边框、置顶、可拖拽

import { BrowserWindow, screen } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { cmToPx, DEFAULT_SIZE_CM, computeWindowPx } from '@shared/constants/physical.js';
import { createLogger } from '@shared/utils/logger.js';

const log = createLogger('main-window');

const __dirname = dirname(fileURLToPath(import.meta.url));

interface CreateOptions {
  position?: { x: number; y: number };
  /** 默认 false（最底层）；true 表示最顶层 */
  windowOnTop?: boolean;
}

function resolvePreloadPath(): string {
  // preload 强制 CJS 输出且扩展名 .cjs（因 package.json type:module 把 .js 当 ESM）
  const candidates = [
    resolve(__dirname, '../preload/index.cjs'),
    resolve(__dirname, '../preload/index.js'),
    resolve(__dirname, '../preload/index.mjs'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0] ?? '';
}

function resolveIndexHtml(): { url?: string; file?: string } {
  const devUrl = process.env['VITE_DEV_SERVER_URL'];
  if (devUrl) return { url: `${devUrl}index.html` };
  const file = resolve(__dirname, '../../dist/index.html');
  return { file };
}

export function createMainWindow(opts: CreateOptions = {}): BrowserWindow {
  const sizeCm = DEFAULT_SIZE_CM;
  const display = screen.getPrimaryDisplay();
  const ppi = display.scaleFactor >= 2 ? 220 : 96;
  const modelPx = cmToPx(sizeCm, ppi);
  const totalPx = computeWindowPx(modelPx);

  // 窗口可以超出工作区（透明部分不可见，对用户无感），只要保证模型在可见区域。
  // 模型位于窗口正中央，所以让模型中心点在工作区可视范围内即可。
  const rawPos = opts.position ?? {
    x: display.workArea.x + Math.round((display.workArea.width - totalPx) / 2),
    y: display.workArea.y + Math.round((display.workArea.height - totalPx) / 2),
  };
  // 限制窗口中心点不超出工作区
  const wa = display.workArea;
  const halfW = Math.round(totalPx / 2);
  const halfH = Math.round(totalPx / 2);
  const position = {
    x: Math.max(wa.x - halfW + 80, Math.min(rawPos.x, wa.x + wa.width - 80 - halfW)),
    y: Math.max(wa.y - halfH + 80, Math.min(rawPos.y, wa.y + wa.height - 80 - halfH)),
  };

  const preload = resolvePreloadPath();
  log.info('createMainWindow', { sizeCm, modelPx, totalPx, position, preload });

  const win = new BrowserWindow({
    width: totalPx,
    height: totalPx,
    x: position.x,
    y: position.y,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: true,
    // alwaysOnTop 由下方 setAlwaysOnTop 根据 settings.windowOnTop 决定，构造期不锁定
    alwaysOnTop: false,
    skipTaskbar: true,
    fullscreenable: false,
    focusable: true,
    backgroundColor: '#00000000',
    title: '桌面小小英雄',
    show: false,
    // macOS 使用 NSPanel：可越过菜单栏，不抢应用焦点，与桌宠定位一致；
    // 同时让上边框与左/右/下边框一致地允许隐藏到屏幕外（默认普通窗口会被系统 y-clamp 在菜单栏下方）
    ...(process.platform === 'darwin' ? { type: 'panel' as const } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload,
    },
  });

  // 桌宠默认非置顶（被其他获焦窗口盖住，近似"最底层"）；菜单切换为最顶层（screen-saver）
  if (opts.windowOnTop) win.setAlwaysOnTop(true, 'screen-saver');
  else win.setAlwaysOnTop(false);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });

  if (process.platform === 'darwin') {
    win.setWindowButtonVisibility?.(false);
  }

  // 转发 renderer console 输出到主进程 + 写到日志文件
  // prod 也启用，便于排查；DevTools 仅 dev 自动开
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    const tag = ['DEBUG', 'INFO', 'WARN', 'ERROR'][level] ?? 'LOG';
    const src = sourceId ? ` (${sourceId}:${line})` : '';
    log.info(`[renderer:${tag}] ${message}${src}`);
  });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    log.error(`renderer did-fail-load url=${url} code=${code} desc=${desc}`);
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    log.error(`render-process-gone reason=${details.reason} exitCode=${details.exitCode}`);
  });
  // DevTools 仅在 dev 模式自动开
  if (process.env['VITE_DEV_SERVER_URL']) {
    win.webContents.once('did-finish-load', () => {
      win.webContents.openDevTools({ mode: 'detach' });
    });
  }

  const target = resolveIndexHtml();
  if (target.url) {
    void win.loadURL(target.url);
  } else if (target.file) {
    void win.loadFile(target.file);
  }

  win.once('ready-to-show', () => {
    win.show();
  });

  return win;
}

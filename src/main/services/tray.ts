// 系统托盘（macOS 状态栏）：左键弹菜单，菜单内可选角色 / 主题 / 置顶 / 退出

import { Tray, Menu, BrowserWindow, nativeImage } from 'electron';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import type { UserSettings } from '@shared/domain/settings.js';
import type { SettingsStore } from './store.js';
import { buildAppMenuTemplate } from './menu.js';
import { createLogger } from '@shared/utils/logger.js';

const log = createLogger('tray');
const __dirname = dirname(fileURLToPath(import.meta.url));

let tray: Tray | null = null;

interface TrayDeps {
  getMainWindow: () => BrowserWindow | null;
  store: SettingsStore;
  onSwitchCharacter: (id: string) => void;
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
  const image = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  if (iconPath) image.setTemplateImage(true);

  try {
    tray = new Tray(image);
  } catch (err) {
    log.warn('createTray failed', err);
    return null;
  }

  tray.setToolTip('桌面小小英雄');
  if (!iconPath) tray.setTitle('小');

  // 每次点击都重建菜单，保证 radio / checkbox 当前状态最新
  const rebuild = (): void => {
    const items: Electron.MenuItemConstructorOptions[] = [
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
      { type: 'separator' },
      ...buildAppMenuTemplate({
        getCurrentCharacter: () => deps.store.get().selectedCharacterId,
        getTheme: () => deps.store.get().theme,
        isWindowOnTop: () => deps.store.get().windowOnTop,
        onSwitchCharacter: deps.onSwitchCharacter,
        onSetTheme: (theme: UserSettings['theme']) => {
          deps.store.patch({ theme });
          log.info(`theme changed → ${theme}`);
        },
        onToggleWindowOnTop: () => {
          const next = !deps.store.get().windowOnTop;
          deps.store.patch({ windowOnTop: next });
          const win = deps.getMainWindow();
          if (next) win?.setAlwaysOnTop(true, 'screen-saver');
          else win?.setAlwaysOnTop(false);
          log.info(`window on-top toggled → ${next}`);
        },
      }),
    ];
    tray?.setContextMenu(Menu.buildFromTemplate(items));
  };

  rebuild();
  // settings 变化时（如 renderer 端改了主题）重建菜单让 radio 同步
  deps.store.onChange(() => rebuild());

  return tray;
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
}

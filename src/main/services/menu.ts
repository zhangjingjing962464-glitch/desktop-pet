// 右键菜单：角色切换 / 设置 / 暂停提醒 / 退出

import { Menu, BrowserWindow, app } from 'electron';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CharactersManifest } from '@shared/domain/character.js';
import { IPC } from '@shared/ipc/channels.js';
import { createLogger } from '@shared/utils/logger.js';

const log = createLogger('menu');
const __dirname = dirname(fileURLToPath(import.meta.url));

let cachedManifest: CharactersManifest | null = null;
function loadManifest(): CharactersManifest {
  if (cachedManifest) return cachedManifest;
  const candidates = [
    resolve(__dirname, '../../assets/manifest/characters.json'),
    resolve(process.cwd(), 'assets/manifest/characters.json'),
    resolve(process.resourcesPath ?? '', 'manifest/characters.json'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      cachedManifest = JSON.parse(readFileSync(c, 'utf-8')) as CharactersManifest;
      return cachedManifest;
    }
  }
  log.warn('characters.json 未找到');
  cachedManifest = { generatedAt: '', totalBytes: 0, count: 0, characters: [] };
  return cachedManifest;
}

interface MenuDeps {
  getCurrentCharacter(): string;
  isRemindersPaused(): boolean;
  isWindowOnTop(): boolean;
  onSwitchCharacter(id: string): void;
  onOpenSettings(): void;
  onTogglePause(): void;
  onToggleWindowOnTop(): void;
  onQuit(): void;
}

/** 弹出右键菜单。x/y 是 renderer 内 client 坐标，需要传给 popup 时 Electron 会按窗口内坐标处理 */
export function popupContextMenu(win: BrowserWindow, deps: MenuDeps): void {
  const manifest = loadManifest();
  const currentId = deps.getCurrentCharacter();

  // 按 baseId 分组形成二级菜单
  const groups = new Map<string, typeof manifest.characters[number][]>();
  for (const c of manifest.characters) {
    const arr = groups.get(c.baseId) ?? [];
    arr.push(c);
    groups.set(c.baseId, arr);
  }

  const characterSubmenu: Electron.MenuItemConstructorOptions[] = [];
  const sortedGroups = Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  for (const [baseId, chars] of sortedGroups) {
    if (chars.length === 1) {
      const c = chars[0];
      if (!c) continue;
      characterSubmenu.push({
        label: c.displayName,
        type: 'radio',
        checked: c.id === currentId,
        click: () => deps.onSwitchCharacter(c.id),
      });
    } else {
      characterSubmenu.push({
        label: baseId.charAt(0).toUpperCase() + baseId.slice(1),
        submenu: chars.map((c) => ({
          label: c.displayName,
          type: 'radio' as const,
          checked: c.id === currentId,
          click: () => deps.onSwitchCharacter(c.id),
        })),
      });
    }
  }

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '切换角色',
      submenu: characterSubmenu.length > 0 ? characterSubmenu : [{ label: '（无可用角色）', enabled: false }],
    },
    { type: 'separator' },
    {
      label: '窗口置顶',
      type: 'checkbox',
      checked: deps.isWindowOnTop(),
      click: () => deps.onToggleWindowOnTop(),
    },
    {
      label: deps.isRemindersPaused() ? '恢复提醒' : '暂停提醒',
      click: () => deps.onTogglePause(),
    },
    {
      label: '设置...',
      accelerator: 'CommandOrControl+,',
      click: () => deps.onOpenSettings(),
    },
    { type: 'separator' },
    {
      label: '退出',
      role: 'quit',
      click: () => {
        deps.onQuit();
        app.quit();
      },
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  menu.popup({ window: win });
}

/** 通知 renderer 右键菜单结果（在 click 回调里直接发） */
export function notifyMenuResult(win: BrowserWindow, payload: unknown): void {
  win.webContents.send(IPC.menu.onResult, payload);
}


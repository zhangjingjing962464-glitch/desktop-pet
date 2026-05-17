// 应用菜单 builder：托盘菜单 + 右键菜单复用同一套 template
// 内容：切换角色（baseId 二级）/ 主题（浅/深/跟随系统）/ 窗口置顶 / 退出

import { Menu, BrowserWindow, app } from 'electron';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CharactersManifest } from '@shared/domain/character.js';
import type { UserSettings } from '@shared/domain/settings.js';
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

export interface AppMenuDeps {
  getCurrentCharacter(): string;
  getTheme(): UserSettings['theme'];
  isWindowOnTop(): boolean;
  onSwitchCharacter(id: string): void;
  onSetTheme(theme: UserSettings['theme']): void;
  onToggleWindowOnTop(): void;
}

/** 构建应用主菜单 template（切换角色 / 主题 / 窗口置顶 / 退出）
 *  托盘和右键菜单共用此 template */
export function buildAppMenuTemplate(deps: AppMenuDeps): Electron.MenuItemConstructorOptions[] {
  const manifest = loadManifest();
  const currentId = deps.getCurrentCharacter();
  const currentTheme = deps.getTheme();

  // 角色按 baseId 分组形成二级菜单
  const groups = new Map<string, typeof manifest.characters[number][]>();
  for (const c of manifest.characters) {
    const arr = groups.get(c.baseId) ?? [];
    arr.push(c);
    groups.set(c.baseId, arr);
  }
  const sortedGroups = Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  const characterSubmenu: Electron.MenuItemConstructorOptions[] = [];
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

  return [
    {
      label: '切换角色',
      submenu: characterSubmenu.length > 0 ? characterSubmenu : [{ label: '（无可用角色）', enabled: false }],
    },
    {
      label: '主题',
      submenu: [
        {
          label: '浅色',
          type: 'radio',
          checked: currentTheme === 'light',
          click: () => deps.onSetTheme('light'),
        },
        {
          label: '深色',
          type: 'radio',
          checked: currentTheme === 'dark',
          click: () => deps.onSetTheme('dark'),
        },
        {
          label: '跟随系统',
          type: 'radio',
          checked: currentTheme === 'system',
          click: () => deps.onSetTheme('system'),
        },
      ],
    },
    { type: 'separator' },
    {
      label: '窗口置顶',
      type: 'checkbox',
      checked: deps.isWindowOnTop(),
      click: () => deps.onToggleWindowOnTop(),
    },
    { type: 'separator' },
    {
      label: '退出',
      role: 'quit',
      click: () => app.quit(),
    },
  ];
}

/** 弹出右键菜单 */
export function popupContextMenu(win: BrowserWindow, deps: AppMenuDeps): void {
  const menu = Menu.buildFromTemplate(buildAppMenuTemplate(deps));
  menu.popup({ window: win });
}

/** 通知 renderer 右键菜单结果（在 click 回调里直接发） */
export function notifyMenuResult(win: BrowserWindow, payload: unknown): void {
  win.webContents.send(IPC.menu.onResult, payload);
}

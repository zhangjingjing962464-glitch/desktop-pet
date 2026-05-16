// 角色资源 IPC handlers

import { ipcMain, app } from 'electron';
import { IPC } from '@shared/ipc/channels.js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CharactersManifest, CharacterMeta } from '@shared/domain/character.js';
import { createLogger } from '@shared/utils/logger.js';

const log = createLogger('character-handlers');
const __dirname = dirname(fileURLToPath(import.meta.url));

/** 解析 characters.json 位置（dev/prod 兼容） */
function resolveManifestPath(): string {
  const candidates = [
    resolve(__dirname, '../../assets/manifest/characters.json'),
    resolve(process.cwd(), 'assets/manifest/characters.json'),
    resolve(app.getAppPath(), 'assets/manifest/characters.json'),
    resolve(process.resourcesPath ?? '', 'manifest/characters.json'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  log.warn('characters.json 未找到，候选路径', candidates);
  return candidates[0] ?? '';
}

let cached: CharactersManifest | null = null;
function loadManifest(): CharactersManifest {
  if (cached) return cached;
  const path = resolveManifestPath();
  const json = readFileSync(path, 'utf-8');
  cached = JSON.parse(json) as CharactersManifest;
  return cached;
}

export function registerCharacterHandlers(): void {
  ipcMain.handle(IPC.characters.list, (): ReadonlyArray<CharacterMeta> => loadManifest().characters);
  ipcMain.handle(IPC.characters.assetUrl, (_e, id: string): string => {
    const meta = loadManifest().characters.find((c) => c.id === id);
    if (!meta) throw new Error(`unknown character id: ${id}`);
    // 用自定义 app:// 协议，dev/prod 一致，避开 Chromium 对 file:// 的限制
    return `app://models/${encodeURIComponent(meta.filename)}`;
  });
}

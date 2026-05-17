// 类型安全的 IPC 桥，暴露给 renderer

import { ipcRenderer } from 'electron';
import { IPC } from '@shared/ipc/channels.js';
import type {
  PreloadApi,
  SetWindowSizePayload,
  SetWindowPositionPayload,
  SetIgnoreMousePayload,
  ContextMenuPayload,
  ContextMenuResult,
  CursorUpdatePayload,
  DisplayMetrics,
} from '@shared/ipc/contracts.js';
import type { UserSettings } from '@shared/domain/settings.js';
import type { CharacterMeta } from '@shared/domain/character.js';

function listenChannel<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_e: Electron.IpcRendererEvent, payload: T): void => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

export const api: PreloadApi = {
  settings: {
    get: () => ipcRenderer.invoke(IPC.settings.get) as Promise<UserSettings>,
    patch: (partial) => ipcRenderer.invoke(IPC.settings.patch, partial) as Promise<UserSettings>,
    onChange: (cb) => listenChannel<UserSettings>(IPC.settings.onChange, cb),
  },
  display: {
    getMetrics: () => ipcRenderer.invoke(IPC.display.getMetrics) as Promise<DisplayMetrics>,
  },
  window: {
    setSize: (p: SetWindowSizePayload) => ipcRenderer.invoke(IPC.window.setSize, p) as Promise<void>,
    setPosition: (p: SetWindowPositionPayload) =>
      ipcRenderer.invoke(IPC.window.setPosition, p) as Promise<void>,
    setIgnoreMouse: (p: SetIgnoreMousePayload) =>
      ipcRenderer.invoke(IPC.window.setIgnoreMouse, p) as Promise<void>,
    setAlwaysOnTop: (on) => ipcRenderer.invoke(IPC.window.setAlwaysOnTop, on) as Promise<void>,
    focus: () => ipcRenderer.invoke(IPC.window.focus) as Promise<void>,
  },
  menu: {
    popupContext: (p: ContextMenuPayload) =>
      ipcRenderer.invoke(IPC.menu.popupContext, p) as Promise<void>,
    onResult: (cb) => listenChannel<ContextMenuResult>(IPC.menu.onResult, cb),
  },
  characters: {
    list: () =>
      ipcRenderer.invoke(IPC.characters.list) as Promise<ReadonlyArray<CharacterMeta>>,
    assetUrl: (id) => ipcRenderer.invoke(IPC.characters.assetUrl, id) as Promise<string>,
  },
  power: {
    onSuspend: (cb) => listenChannel<void>(IPC.power.onSuspend, () => cb()),
    onResume: (cb) => listenChannel<void>(IPC.power.onResume, () => cb()),
  },
  cursor: {
    onUpdate: (cb) => listenChannel<CursorUpdatePayload>(IPC.cursor.update, cb),
  },
};

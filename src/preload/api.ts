// 类型安全的 IPC 桥，暴露给 renderer

import { ipcRenderer } from 'electron';
import { IPC } from '@shared/ipc/channels.js';
import type {
  PreloadApi,
  SetWindowSizePayload,
  SetWindowPositionPayload,
  SetIgnoreMousePayload,
  NotifyPayload,
  ContextMenuPayload,
  ContextMenuResult,
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
    openSettings: () => ipcRenderer.invoke(IPC.window.openSettings) as Promise<void>,
    focus: () => ipcRenderer.invoke(IPC.window.focus) as Promise<void>,
  },
  menu: {
    popupContext: (p: ContextMenuPayload) =>
      ipcRenderer.invoke(IPC.menu.popupContext, p) as Promise<void>,
    onResult: (cb) => listenChannel<ContextMenuResult>(IPC.menu.onResult, cb),
  },
  notify: {
    show: (p: NotifyPayload) => ipcRenderer.invoke(IPC.notify.show, p) as Promise<void>,
  },
  reminder: {
    state: () =>
      ipcRenderer.invoke(IPC.reminder.state) as Promise<{ state: string; remainingMs: number }>,
    skipRest: () => ipcRenderer.invoke(IPC.reminder.skipRest) as Promise<void>,
    pauseAll: (paused) => ipcRenderer.invoke(IPC.reminder.pauseAll, paused) as Promise<void>,
    onEnterResting: (cb) => listenChannel<void>(IPC.reminder.onEnterResting, () => cb()),
    onExitResting: (cb) => listenChannel<void>(IPC.reminder.onExitResting, () => cb()),
    onMealTrigger: (cb) =>
      listenChannel<'breakfast' | 'lunch' | 'dinner'>(IPC.reminder.onMealTrigger, cb),
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
  dialog: {
    pickAudio: () => ipcRenderer.invoke(IPC.dialog.pickAudio) as Promise<string | null>,
  },
  audio: {
    preview: (sound) => ipcRenderer.invoke(IPC.audio.preview, sound) as Promise<void>,
  },
};

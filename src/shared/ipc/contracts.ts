// IPC 请求/响应类型契约

import type { UserSettings } from '../domain/settings.js';
import type { CharacterMeta } from '../domain/character.js';

export interface DisplayMetrics {
  /** device pixel ratio */
  scaleFactor: number;
  /** 主屏工作区（去掉菜单栏/Dock）尺寸（CSS px） */
  workAreaSize: { width: number; height: number };
  /** 主屏完整尺寸（CSS px） */
  size: { width: number; height: number };
  /** 估算的 PPI */
  estimatedPpi: number;
}

export interface SetWindowSizePayload {
  widthPx: number;
  heightPx: number;
  /** 缩放锚点：默认按当前窗口中心 */
  anchor?: 'center' | 'top-left';
}

export interface SetWindowPositionPayload {
  x: number;
  y: number;
}

export interface SetIgnoreMousePayload {
  ignore: boolean;
  forward?: boolean;
}

export interface NotifyPayload {
  title: string;
  body: string;
  tag?: string;
  silent?: boolean;
  /** macOS NSSound 系统音名或本地音频文件绝对路径 */
  sound?: string;
}

export interface ContextMenuPayload {
  x: number;
  y: number;
}

export type ContextMenuResult =
  | { type: 'switch-character'; characterId: string }
  | { type: 'open-settings' }
  | { type: 'toggle-pause-reminders' }
  | { type: 'quit' };

/** 暴露给 renderer 的类型化 API（preload 中实现） */
export interface PreloadApi {
  settings: {
    get(): Promise<UserSettings>;
    patch(partial: Partial<UserSettings>): Promise<UserSettings>;
    onChange(cb: (s: UserSettings) => void): () => void;
  };
  display: {
    getMetrics(): Promise<DisplayMetrics>;
  };
  window: {
    setSize(p: SetWindowSizePayload): Promise<void>;
    setPosition(p: SetWindowPositionPayload): Promise<void>;
    setIgnoreMouse(p: SetIgnoreMousePayload): Promise<void>;
    setAlwaysOnTop(on: boolean): Promise<void>;
    openSettings(): Promise<void>;
    focus(): Promise<void>;
  };
  menu: {
    popupContext(p: ContextMenuPayload): Promise<void>;
    onResult(cb: (r: ContextMenuResult) => void): () => void;
  };
  notify: {
    show(p: NotifyPayload): Promise<void>;
  };
  dialog: {
    /** 弹出原生文件选择框，让用户选自定义提示音文件，返回路径或 null */
    pickAudio(): Promise<string | null>;
  };
  audio: {
    /** 试听一个提示音（系统名或文件路径） */
    preview(sound: string): Promise<void>;
  };
  reminder: {
    state(): Promise<{ state: string; remainingMs: number }>;
    skipRest(): Promise<void>;
    pauseAll(paused: boolean): Promise<void>;
    onEnterResting(cb: () => void): () => void;
    onExitResting(cb: () => void): () => void;
    onMealTrigger(cb: (meal: 'breakfast' | 'lunch' | 'dinner') => void): () => void;
  };
  characters: {
    list(): Promise<ReadonlyArray<CharacterMeta>>;
    /** 返回 renderer 可以直接喂给 GLTFLoader 的 URL */
    assetUrl(id: string): Promise<string>;
  };
  power: {
    onSuspend(cb: () => void): () => void;
    onResume(cb: () => void): () => void;
  };
}

declare global {
  interface Window {
    pet: PreloadApi;
  }
}

// 全局快捷键

import { globalShortcut } from 'electron';
import { createLogger } from '@shared/utils/logger.js';
import type { SettingsStore } from './store.js';

const log = createLogger('shortcuts');

interface Handlers {
  pauseReminders: () => void;
  toggleVisible: () => void;
  openSettings: () => void;
}

export class ShortcutsManager {
  private registered: string[] = [];
  private listenerAttached = false;

  constructor(
    private readonly store: SettingsStore,
    private readonly handlers: Handlers,
  ) {}

  register(): void {
    this.applyAll();
    // 监听只挂一次。之前每次 register() 都 store.onChange(...)，
    // 而 listener 又调 register() → 再 onChange → Set.forEach 在遍历中
    // 不断添加自己，导致 store.patch 死循环、主进程卡死、IPC 全部停摆
    if (!this.listenerAttached) {
      this.listenerAttached = true;
      this.store.onChange(() => this.applyAll());
    }
  }

  unregister(): void {
    for (const k of this.registered) globalShortcut.unregister(k);
    this.registered = [];
  }

  private applyAll(): void {
    this.unregister();
    const s = this.store.get();
    this.tryRegister(s.shortcuts.pauseReminders, this.handlers.pauseReminders);
    this.tryRegister(s.shortcuts.toggleVisible, this.handlers.toggleVisible);
    this.tryRegister(s.shortcuts.openSettings, this.handlers.openSettings);
  }

  private tryRegister(accelerator: string, handler: () => void): void {
    try {
      const ok = globalShortcut.register(accelerator, handler);
      if (ok) this.registered.push(accelerator);
      else log.warn(`shortcut register failed: ${accelerator}`);
    } catch (err) {
      log.warn(`shortcut register exception: ${accelerator}`, err);
    }
  }
}

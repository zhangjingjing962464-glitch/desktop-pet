// electron-store 封装 + zod 校验

import Store from 'electron-store';
import { SettingsSchema, DEFAULT_SETTINGS, type UserSettings } from '@shared/domain/settings.js';
import { createLogger } from '@shared/utils/logger.js';

const log = createLogger('store');

export class SettingsStore {
  private readonly store: Store<{ settings: UserSettings }>;
  private readonly listeners = new Set<(s: UserSettings) => void>();

  constructor() {
    this.store = new Store<{ settings: UserSettings }>({
      name: 'desktop-pet-settings',
      defaults: { settings: DEFAULT_SETTINGS },
    });
    this.validate();
  }

  /** 启动时校验存储里的数据；若 schema 不匹配则合并默认值后写回 */
  private validate(): void {
    const raw = this.store.get('settings');
    const parsed = SettingsSchema.safeParse(raw);
    if (parsed.success) return;
    log.warn('存储中的设置不符合 schema，合并默认值后写回', parsed.error.format());
    const merged = SettingsSchema.parse({ ...DEFAULT_SETTINGS, ...(raw ?? {}) });
    this.store.set('settings', merged);
  }

  get(): UserSettings {
    return this.store.get('settings');
  }

  patch(partial: Partial<UserSettings>): UserSettings {
    const current = this.get();
    const next = SettingsSchema.parse({ ...current, ...partial });
    this.store.set('settings', next);
    // 用快照迭代：若 listener 在执行中又向 listeners 添加 / 删除元素，
    // 不会影响本次广播，避免触发 Set.forEach 在迭代中包含新增项的死循环
    const snapshot = Array.from(this.listeners);
    for (const cb of snapshot) {
      try {
        cb(next);
      } catch (err) {
        log.error('settings listener throw', err);
      }
    }
    return next;
  }

  onChange(cb: (s: UserSettings) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}

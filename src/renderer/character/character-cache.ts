// CharacterController LRU 缓存：最多 4 项 / 80MB。命中即秒切，未命中由调用方加载

import type { CharacterController } from './character-controller.js';
import { createLogger } from '@shared/utils/logger.js';

const log = createLogger('character-cache');

interface Entry {
  controller: CharacterController;
  bytes: number;
  lastUsedAt: number;
}

export interface CacheOptions {
  maxEntries: number;
  maxBytes: number;
}

const DEFAULT_OPTS: CacheOptions = {
  maxEntries: 4,
  maxBytes: 80 * 1024 * 1024,
};

export class CharacterCache {
  private readonly entries = new Map<string, Entry>();
  private readonly opts: CacheOptions;
  /** 锁定不允许 evict 的 id（当前正在使用） */
  private readonly locked = new Set<string>();

  constructor(opts: Partial<CacheOptions> = {}) {
    this.opts = { ...DEFAULT_OPTS, ...opts };
  }

  lock(id: string): void {
    if (id) this.locked.add(id);
  }
  unlock(id: string): void {
    this.locked.delete(id);
  }

  get(id: string): CharacterController | null {
    const e = this.entries.get(id);
    if (!e) return null;
    e.lastUsedAt = Date.now();
    return e.controller;
  }

  /** 放入缓存。bytes 是模型大小估算（用 GLB 字节数即可） */
  put(id: string, controller: CharacterController, bytes: number): void {
    const existing = this.entries.get(id);
    if (existing) {
      existing.controller.dispose();
    }
    this.entries.set(id, { controller, bytes, lastUsedAt: Date.now() });
    this.evictIfNeeded();
  }

  /** 显式释放指定角色 */
  evict(id: string): void {
    const e = this.entries.get(id);
    if (!e) return;
    e.controller.dispose();
    this.entries.delete(id);
  }

  /** 按 LRU 顺序释放，保留最近 N 项 */
  private evictIfNeeded(): void {
    while (this.shouldEvict()) {
      const oldest = this.findOldest();
      if (!oldest) break;
      log.info(`evict LRU id=${oldest}`);
      this.evict(oldest);
    }
  }

  private shouldEvict(): boolean {
    if (this.entries.size > this.opts.maxEntries) return true;
    let total = 0;
    for (const e of this.entries.values()) total += e.bytes;
    return total > this.opts.maxBytes;
  }

  private findOldest(): string | null {
    let oldestId: string | null = null;
    let oldestT = Number.POSITIVE_INFINITY;
    for (const [id, e] of this.entries) {
      if (this.locked.has(id)) continue;
      if (e.lastUsedAt < oldestT) {
        oldestT = e.lastUsedAt;
        oldestId = id;
      }
    }
    return oldestId;
  }

  size(): number {
    return this.entries.size;
  }

  totalBytes(): number {
    let total = 0;
    for (const e of this.entries.values()) total += e.bytes;
    return total;
  }

  disposeAll(): void {
    for (const e of this.entries.values()) e.controller.dispose();
    this.entries.clear();
  }
}

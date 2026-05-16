// 缓存 manifest 与查询接口

import type { CharacterMeta } from '@shared/domain/character.js';

export class CharacterRegistry {
  private cache: ReadonlyArray<CharacterMeta> | null = null;

  async load(): Promise<ReadonlyArray<CharacterMeta>> {
    if (this.cache) return this.cache;
    this.cache = await window.pet.characters.list();
    return this.cache;
  }

  /** 同步取（必须先 load） */
  list(): ReadonlyArray<CharacterMeta> {
    return this.cache ?? [];
  }

  find(id: string): CharacterMeta | null {
    return this.cache?.find((c) => c.id === id) ?? null;
  }
}

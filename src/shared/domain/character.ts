// 角色元数据类型（与 build-manifest.mjs 输出一致）

export interface AnimationMeta {
  readonly name: string;
  readonly duration: number;
}

export interface CharacterMeta {
  readonly id: string;
  readonly baseId: string;
  readonly displayName: string;
  readonly filename: string;
  readonly bytes: number;
  readonly hasHeadBone: boolean;
  readonly headBoneName: string | null;
  readonly animations: ReadonlyArray<AnimationMeta>;
}

export interface CharactersManifest {
  readonly generatedAt: string;
  readonly totalBytes: number;
  readonly count: number;
  readonly characters: ReadonlyArray<CharacterMeta>;
}

/** 默认选中角色 ID（M1 用 chibi_lulu，资源最小且包含 17 个动画足够覆盖核心场景） */
export const DEFAULT_CHARACTER_ID = 'chibi_lulu';

// 动画管理器：单一动作 + 拼接序列；crossFade 平滑过渡
// 所有方法对外都是异步：play 返回一个在该动作"自然结束或被打断"时 resolve 的 Promise

import * as THREE from 'three';
import type { ActionSequence, ActionStep } from './action-sequence.js';
import { CROSSFADE_DEFAULT_S, CROSSFADE_INTERRUPT_S } from '@shared/constants/time.js';
import { createLogger } from '@shared/utils/logger.js';

const log = createLogger('animation-manager');

/**
 * 标准动作名 → Riot 实际 GLB 中可能的命名变体。
 *
 * Riot 不同皮肤 / 不同年份导出的 GLB clip 命名混乱：
 *   - 拼写错误：`tuant` ←→ `Taunt`
 *   - 数字后缀：`Laugh01` `Laugh02` 实际就是 `Laugh`
 *   - 内部前缀：`PetChibiGwen_Base_joke.anm` 实际是 `Joke`
 *   - 同义替换：`Celebrate` ≈ `Dance_In`，`Run` ≈ `Run_Base`
 *
 * 让调度代码（SINGLE_ACTION_POOLS / SEQUENCE_PRESETS）继续用标准名，
 * 由这里把请求名 resolve 到实际 clip 名。第一个匹配的 clip 即作别名缓存
 */
const NAME_VARIANTS: Record<string, RegExp[]> = {
  // Taunt 兼容三种命名：纯 `Taunt`、拼错的 `tuant`、Riot Yunara 的 `_Taunt01.`~`_Taunt06.` 带数字
  Taunt: [/^Taunt$/i, /^Taunt\d+$/i, /(?:^|_)tuant\d*(?:\.|$)/i, /(?:^|_)taunt\d*(?:\.|$)/i],
  Taunt_In: [/^Taunt_In$/i, /(?:^|_)tuant_?in/i, /(?:^|_)taunt_?in/i],
  Joke: [/^Joke$/i, /(?:^|_)joke(?:\.|$)/i],
  Joke_In: [/^Joke_In$/i, /(?:^|_)joke_?in/i],
  Joke_Loop: [/^Joke_Loop$/i, /(?:^|_)joke_?loop/i],
  JokeA_In: [/^JokeA_In$/i],
  JokeB_In: [/^JokeB_In$/i],
  JokeC_In: [/^JokeC_In$/i],
  // Laugh 兼容 `Laugh`/`Laugh01`/`LaughA`/`Laugh_In`/`Laugh_Loop` 各种命名
  Laugh: [/^Laugh$/i, /^Laugh\d+$/i, /^Laugh[A-C]$/i, /^Laugh_In$/i, /^Laugh_Loop$/i],
  Greeting: [/^Greeting$/i, /(?:^|_)greeting(?:\.|$)/i, /^Greet/i],
  Idle_Base: [/^Idle_Base$/i, /^Idle$/i],
  Idle_In: [/^Idle_In$/i, /(?:_)idleIn(?:\.|$)/i],
  Run_Base: [/^Run_Base$/i, /^Run$/i],
  Run_Haste: [/^Run_Haste$/i, /(?:^|_)run_?haste(?:\.|$)/i],
  Cast_Animation: [/^Cast_Animation$/i, /^Cast$/i],
  Cast_Cycle: [/^Cast_Cycle$/i],
  Cast_Damage: [/^Cast_Damage$/i],
  Dance_In: [/^Dance_In$/i, /^Celebrate$/i],
  Dance_Loop: [/^Dance_Loop$/i],
  Dance01_Loop: [/^Dance01_Loop$/i, /^Dance_Loop$/i],
  Dance02_Loop: [/^Dance02_Loop$/i, /^Dance_Loop$/i],
  Damage_Hurt: [/^Damage_Hurt$/i],
  Interact: [/^Interact$/i],
  Recall: [/^Recall$/i],
  Recall_Winddown: [/^Recall_Winddown$/i],
  Dive_In: [/^Dive_In$/i],
  Dive_Out: [/^Dive_Out$/i],
  Death: [/^Death$/i],
  Finisher01: [/^Finisher_?0?1$/i, /(?:^|_)finisher_?0?1(?:\.|$)/i],
  Finisher02: [/^Finisher_?0?2$/i, /(?:^|_)finisher_?0?2(?:\.|$)/i],
  Finisher03: [/^Finisher_?0?3$/i, /(?:^|_)finisher_?0?3(?:\.|$)/i],
  Finisher04: [/^Finisher_?0?4$/i, /(?:^|_)finisher_?0?4(?:\.|$)/i],
  Finisher05: [/^Finisher_?0?5$/i, /(?:^|_)finisher_?0?5(?:\.|$)/i],
  Finisher06: [/^Finisher_?0?6$/i, /(?:^|_)finisher_?0?6(?:\.|$)/i],
  // Gwen 专属：变玩偶进入。chibi_gwen 用 `PetChibiGwen_Base_Doll_IdleIn.anm`，
  // Crystal Rose Gwen 用 `PetChibiGwen_CrystalRose_Doll_IdleIn.CHIBI_Gwen_CrystalRose.anm`
  Doll_IdleIn: [/^Doll_IdleIn$/i, /(?:^|_)doll_idle_?in(?:\.|$)/i],
};

export interface PlayOptions {
  loop?: THREE.AnimationActionLoopStyles;
  repetitions?: number;
  crossFade?: number;
  timeScale?: number;
}

export class AnimationManager {
  private current: THREE.AnimationAction | null = null;
  private runId = 0;
  private finishedListener: ((e: { action: THREE.AnimationAction }) => void) | null = null;
  /** 标准名 → 所有匹配 clip 列表的缓存（按名字匹配，不随机）。空数组=无匹配。 */
  private readonly matchCache = new Map<string, ReadonlyArray<string>>();

  constructor(
    private readonly mixer: THREE.AnimationMixer,
    private readonly clips: ReadonlyMap<string, THREE.AnimationClip>,
  ) {}

  /** 列出标准名对应的所有匹配 clip。Riot Yunara 有 Taunt01..06 六个 clip，
   *  Crystal Rose Gwen 的 Laugh01/Laugh02 各一个；如果只返回第一个匹配并缓存，
   *  随机调度永远只播 Taunt01 一个——视觉上"动作单调"。 */
  private resolveClipMatches(name: string): ReadonlyArray<string> {
    const cached = this.matchCache.get(name);
    if (cached) return cached;
    const matched: string[] = [];
    if (this.clips.has(name)) matched.push(name);
    const variants = NAME_VARIANTS[name];
    if (variants) {
      for (const k of this.clips.keys()) {
        if (k === name) continue; // 已经加过
        if (variants.some((re) => re.test(k))) matched.push(k);
      }
    }
    this.matchCache.set(name, matched);
    return matched;
  }

  /** 每次调用随机选一个匹配 clip——让 Yunara 的 6 个 Taunt 都有机会播。 */
  private resolveClipName(name: string): string | null {
    const matches = this.resolveClipMatches(name);
    if (matches.length === 0) return null;
    return matches[Math.floor(Math.random() * matches.length)] ?? null;
  }

  has(name: string): boolean {
    return this.resolveClipMatches(name).length > 0;
  }

  /** 获取动画时长（秒），未找到返回 null。多 clip 匹配时取第一个的时长——
   *  Run/Joke 等同类 clip 时长接近，不影响 timeScale 计算 */
  getDuration(name: string): number | null {
    const matches = this.resolveClipMatches(name);
    return matches.length > 0 ? (this.clips.get(matches[0]!)?.duration ?? null) : null;
  }

  /** 播放单一动作。LoopOnce 时 Promise 在动作结束 resolve；LoopRepeat 时立即 resolve */
  async play(name: string, opts: PlayOptions = {}): Promise<void> {
    const actual = this.resolveClipName(name);
    const clip = actual ? this.clips.get(actual) : null;
    if (!clip) {
      log.warn(`play: clip not found ${name}`);
      return;
    }
    const myRunId = ++this.runId;
    const crossFade = opts.crossFade ?? CROSSFADE_DEFAULT_S;
    const next = this.mixer.clipAction(clip);
    next.reset();
    next.setLoop(opts.loop ?? THREE.LoopOnce, opts.repetitions ?? 1);
    next.clampWhenFinished = true;
    next.timeScale = opts.timeScale ?? 1;
    if (this.current && this.current !== next) {
      next.enabled = true;
      next.setEffectiveWeight(1);
      this.current.crossFadeTo(next, crossFade, true);
    }
    next.play();
    this.current = next;

    if ((opts.loop ?? THREE.LoopOnce) === THREE.LoopOnce) {
      await this.waitForFinish(myRunId, next);
    }
  }

  /** 播放一个动作序列，按 step 顺序串接 */
  async playSequence(seq: ActionSequence): Promise<void> {
    log.debug(`playSequence ${seq.id}`);
    for (const step of seq.steps) {
      await this.playStep(step);
    }
  }

  private async playStep(step: ActionStep): Promise<void> {
    if (step.loop === 'loop') {
      await this.playLoopStep(step);
    } else {
      await this.play(step.name, { loop: THREE.LoopOnce, ...(step.crossFade !== undefined ? { crossFade: step.crossFade } : {}) });
    }
  }

  private async playLoopStep(step: ActionStep): Promise<void> {
    const actual = this.resolveClipName(step.name);
    const clip = actual ? this.clips.get(actual) : null;
    if (!clip) {
      log.warn(`playLoopStep: clip not found ${step.name}`);
      return;
    }
    const next = this.mixer.clipAction(clip);
    next.reset();
    next.setLoop(THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = false;
    if (this.current && this.current !== next) {
      this.current.crossFadeTo(next, step.crossFade ?? CROSSFADE_DEFAULT_S, true);
    }
    next.play();
    this.current = next;
    await delay((step.loopDuration ?? 1.5) * 1000);
  }

  /** 等待 LoopOnce 动作结束（被 runId 覆盖也立即 resolve） */
  private waitForFinish(myRunId: number, action: THREE.AnimationAction): Promise<void> {
    return new Promise((resolve) => {
      const onFinish = (e: { action: THREE.AnimationAction }): void => {
        if (myRunId !== this.runId) {
          this.mixer.removeEventListener('finished', onFinish as never);
          this.finishedListener = null;
          resolve();
          return;
        }
        if (e.action === action) {
          this.mixer.removeEventListener('finished', onFinish as never);
          this.finishedListener = null;
          resolve();
        }
      };
      this.finishedListener = onFinish;
      this.mixer.addEventListener('finished', onFinish as never);
    });
  }

  /** 立即停下（打断），用于状态切换 */
  stop(crossFade = CROSSFADE_INTERRUPT_S): void {
    this.runId++;
    if (this.current) {
      this.current.fadeOut(crossFade);
      this.current = null;
    }
    if (this.finishedListener) {
      this.mixer.removeEventListener('finished', this.finishedListener as never);
      this.finishedListener = null;
    }
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }

  dispose(): void {
    this.stop(0.0001);
    this.mixer.stopAllAction();
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

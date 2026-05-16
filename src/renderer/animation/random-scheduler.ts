// 5-10s 间隔随机动作调度。
// 大类抽样：单一池(综合权重) vs 拼接池
// 子项抽样：池内按权重；过滤当前角色缺失动画的项；8s 冷却防重复

import type { AnimationManager } from './animation-manager.js';
import { SEQUENCE_PRESETS, SINGLE_ACTION_POOLS, ACTION_BLACKLIST } from './action-presets.js';
import { weightedPick, randRange } from '@shared/utils/math.js';
import {
  RANDOM_ACTION_MIN_MS,
  RANDOM_ACTION_MAX_MS,
  ACTION_COOLDOWN_MS,
  INTERACTION_TIME_SCALE,
} from '@shared/constants/time.js';
import { createLogger } from '@shared/utils/logger.js';

const log = createLogger('random-scheduler');

/** 单一池子相对权重：把"单一动作"作为一个大类的总权重 ~13, "拼接动作" ~5 */
const CATEGORY_SINGLE_WEIGHT = 13;
const CATEGORY_SEQUENCE_WEIGHT = 5;

export interface RandomSchedulerOptions {
  /** 每次随机动作播完后回到 Idle 的回调 */
  returnToIdle: () => Promise<void>;
  /** 动作开始前回调（用于扩展窗口） */
  onActionStart?: () => Promise<void>;
  /** 动作结束后回调（用于收回窗口） */
  onActionEnd?: () => Promise<void>;
}

/** 最近 N 次播放的动作不允许重复。覆盖时间 cooldown 不足时（连续两个 5s 间隔
 *  比 8s cooldown 还短）出现连续相同动作的情况，对用户感知"动作单调"贡献很大。 */
const RECENT_PICK_LIMIT = 10;

export class RandomScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private busy = false;
  private readonly cooldown = new Map<string, number>(); // key → 解除冷却时间戳
  /** FIFO，最多保留最近 RECENT_PICK_LIMIT 次播过的动作 key */
  private readonly recentPicks: string[] = [];
  private pauseReasons = new Set<string>();

  constructor(
    private readonly am: AnimationManager,
    private readonly opts: RandomSchedulerOptions,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.scheduleNext();
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** 暂停调度，返回 resume 回调 */
  pauseFor(reason: string): () => void {
    this.pauseReasons.add(reason);
    log.debug(`pauseFor ${reason}`);
    return () => {
      this.pauseReasons.delete(reason);
      log.debug(`resumeFor ${reason}`);
    };
  }

  private scheduleNext(): void {
    if (!this.running) return;
    const wait = randRange(RANDOM_ACTION_MIN_MS, RANDOM_ACTION_MAX_MS);
    this.timer = setTimeout(() => {
      this.tick().finally(() => this.scheduleNext());
    }, wait);
  }

  private async tick(): Promise<void> {
    if (!this.running || this.busy || this.pauseReasons.size > 0) return;
    this.busy = true;
    let expanded = false;
    try {
      if (this.opts.onActionStart) {
        await this.opts.onActionStart();
        expanded = true;
      }
      await this.playOne();
      if (this.running && this.pauseReasons.size === 0) {
        await this.opts.returnToIdle();
      }
    } catch (err) {
      log.warn('tick err', err);
    } finally {
      if (expanded && this.opts.onActionEnd) {
        try {
          await this.opts.onActionEnd();
        } catch (err) {
          log.warn('onActionEnd err', err);
        }
      }
      this.busy = false;
    }
  }

  private async playOne(): Promise<void> {
    // 1. 大类抽样
    const isSequence = weightedPick<boolean>([
      { value: false, weight: CATEGORY_SINGLE_WEIGHT },
      { value: true, weight: CATEGORY_SEQUENCE_WEIGHT },
    ]);

    const now = Date.now();
    const offCooldown = (key: string): boolean => (this.cooldown.get(key) ?? 0) <= now;

    if (isSequence) {
      // 收集所有可用 sequence（满足必需动画 + 冷却 + 不全是黑名单）
      const allUsableSeq = SEQUENCE_PRESETS.filter(
        (s) =>
          offCooldown(`seq:${s.id}`) &&
          s.requiredAnims.every((n) => this.am.has(n)) &&
          !s.steps.some((step) => ACTION_BLACKLIST.has(step.name)),
      );
      if (allUsableSeq.length === 0) {
        await this.playSingle();
        return;
      }
      // sequence 走绝对 RECENT_PICK_LIMIT 窗口 ban——不像 single 用动态 banN。
      // 因为序列动作冲击感强、重复感更显眼；某些角色（chibi_gwen）的 SEQUENCE
      // requiredAnims 大多没满足，可用序列仅 1 个，动态 banN=0 会让它频繁复现。
      // 候选被 ban 光时降级到 single，而不是放任重复
      const banned = new Set(this.recentPicks.slice(-RECENT_PICK_LIMIT));
      const filtered = allUsableSeq.filter((s) => !banned.has(`seq:${s.id}`));
      if (filtered.length === 0) {
        await this.playSingle();
        return;
      }
      const picked = weightedPick(filtered.map((s) => ({ value: s, weight: s.weight })));
      this.cooldown.set(`seq:${picked.id}`, now + ACTION_COOLDOWN_MS);
      this.pushRecent(`seq:${picked.id}`);
      log.info(`play sequence ${picked.id}`);
      await this.am.playSequence(picked);
      return;
    }

    await this.playSingle();
  }

  private pushRecent(key: string): void {
    this.recentPicks.push(key);
    while (this.recentPicks.length > RECENT_PICK_LIMIT) this.recentPicks.shift();
  }

  private async playSingle(): Promise<void> {
    const now = Date.now();
    const offCooldown = (key: string): boolean => (this.cooldown.get(key) ?? 0) <= now;

    // 1. 收集所有可用项（仅看 has + cooldown + blacklist，不看 recent）
    const allUsable: Array<{ value: string; weight: number }> = [];
    for (const pool of SINGLE_ACTION_POOLS) {
      const usable = pool.anims.filter(
        (n) => this.am.has(n) && offCooldown(`anim:${n}`) && !ACTION_BLACKLIST.has(n),
      );
      if (usable.length === 0) continue;
      const perItemWeight = pool.weight / usable.length;
      for (const anim of usable) {
        allUsable.push({ value: anim, weight: perItemWeight });
      }
    }
    if (allUsable.length === 0) {
      log.warn('no available single action');
      return;
    }

    // 2. 动态 ban 最近 min(RECENT_PICK_LIMIT, allUsable.length - 1) 个，
    //    保证总有 ≥ 1 个未 ban 项（避免 chibi_gwen 只有 9 个可用动作时 fallback 全放弃）
    const banN = Math.min(RECENT_PICK_LIMIT, allUsable.length - 1);
    const banned = new Set(this.recentPicks.slice(-banN));
    const filtered = allUsable.filter((it) => !banned.has(`anim:${it.value}`));
    const items = filtered.length > 0 ? filtered : allUsable;

    const picked = weightedPick(items);
    this.cooldown.set(`anim:${picked}`, now + ACTION_COOLDOWN_MS);
    this.pushRecent(`anim:${picked}`);
    // 短动画拉伸到 ≥ 1.5 秒，避免一闪而过
    const duration = this.am.getDuration(picked) ?? 1.5;
    // 短动作（< 1.5s）拉伸到至少 1.5s 起步速度，再叠加全局 INTERACTION_TIME_SCALE 减速
    const targetDuration = 1.5;
    const base = duration < targetDuration ? Math.max(0.4, duration / targetDuration) : 1;
    const timeScale = base * INTERACTION_TIME_SCALE;
    log.info(`play single ${picked} dur=${duration.toFixed(2)}s ts=${timeScale.toFixed(2)}`);
    await this.am.play(picked, { timeScale });
  }
}

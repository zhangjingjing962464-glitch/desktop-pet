// 工作-休息循环调度器
// - 用目标 epoch 时间戳模型，每分钟对时
// - powerMonitor.suspend/resume 自动续期
// - 通过回调通知 renderer 进入 Resting/退出 Resting

import { powerMonitor } from 'electron';
import type { SettingsStore } from '../services/store.js';
import type { Notifier } from '../services/notifier.js';
import type { UserSettings } from '@shared/domain/settings.js';
import { createLogger } from '@shared/utils/logger.js';

const log = createLogger('work-rest');

/** 取系统名或自定义路径作为通知 sound */
export function pickSound(s: UserSettings): string | undefined {
  if (!s.reminderSoundEnabled) return undefined;
  if (s.reminderSoundName === 'custom') return s.reminderCustomSoundPath || undefined;
  return s.reminderSoundName;
}

export type WorkRestState = 'idle' | 'working' | 'resting';

export interface WorkRestCallbacks {
  /** 进入休息：renderer 需放大、播最长动画 */
  onEnterResting(): void;
  /** 退出休息：renderer 缩回原位 */
  onExitResting(): void;
}

export class WorkRestScheduler {
  private state: WorkRestState = 'idle';
  private workEndAt = 0;
  private restEndAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private suspendedRemaining: number | null = null;

  constructor(
    private readonly store: SettingsStore,
    private readonly notifier: Notifier,
    private readonly cb: WorkRestCallbacks,
  ) {
    powerMonitor.on('suspend', () => this.onSuspend());
    powerMonitor.on('resume', () => this.onResume());
  }

  /** 启动调度（应用启动时调一次） */
  start(): void {
    this.enterWorking();
    this.timer = setInterval(() => this.tick(), 1000);
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.state = 'idle';
  }

  /** 跳过休息 */
  skipRest(): void {
    if (this.state !== 'resting') return;
    log.info('skip rest');
    this.exitResting();
  }

  getState(): { state: WorkRestState; remainingMs: number } {
    const now = Date.now();
    if (this.state === 'working') return { state: 'working', remainingMs: Math.max(0, this.workEndAt - now) };
    if (this.state === 'resting') return { state: 'resting', remainingMs: Math.max(0, this.restEndAt - now) };
    return { state: 'idle', remainingMs: 0 };
  }

  private enterWorking(): void {
    const minutes = this.store.get().workMinutes;
    this.workEndAt = Date.now() + minutes * 60_000;
    this.state = 'working';
    log.info(`enter working ${minutes}min, endAt=${new Date(this.workEndAt).toLocaleString()}`);
  }

  private enterResting(): void {
    const settings = this.store.get();
    const minutes = settings.restMinutes;
    this.restEndAt = Date.now() + minutes * 60_000;
    this.state = 'resting';
    log.info(`enter resting ${minutes}min`);
    const sound = pickSound(settings);
    this.notifier.notify({
      title: '桌面小小英雄',
      body: `工作辛苦啦，该休息 ${minutes} 分钟～`,
      tag: 'rest',
      silent: !settings.reminderSoundEnabled,
      ...(sound ? { sound } : {}),
    });
    this.cb.onEnterResting();
  }

  private exitResting(): void {
    this.cb.onExitResting();
    this.enterWorking();
  }

  private tick(): void {
    if (this.store.get().remindersPaused) return;
    const now = Date.now();
    if (this.state === 'working' && now >= this.workEndAt) {
      this.enterResting();
    } else if (this.state === 'resting' && now >= this.restEndAt) {
      this.exitResting();
    }
  }

  private onSuspend(): void {
    const remaining =
      this.state === 'working'
        ? this.workEndAt - Date.now()
        : this.state === 'resting'
          ? this.restEndAt - Date.now()
          : 0;
    this.suspendedRemaining = Math.max(0, remaining);
    log.info(`suspend remaining=${this.suspendedRemaining}ms`);
  }

  private onResume(): void {
    if (this.suspendedRemaining === null) return;
    const now = Date.now();
    if (this.state === 'working') this.workEndAt = now + this.suspendedRemaining;
    else if (this.state === 'resting') this.restEndAt = now + this.suspendedRemaining;
    log.info(`resume rebased remaining=${this.suspendedRemaining}ms`);
    this.suspendedRemaining = null;
  }
}

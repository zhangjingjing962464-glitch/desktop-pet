// 饭点提醒：早午晚各一次，按日期去重

import type { SettingsStore } from '../services/store.js';
import type { Notifier } from '../services/notifier.js';
import { pickSound } from './work-rest-scheduler.js';
import { createLogger } from '@shared/utils/logger.js';

const log = createLogger('meal');

type MealKey = 'breakfast' | 'lunch' | 'dinner';
const MEAL_LABELS: Record<MealKey, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
};

export interface MealCallbacks {
  /** 触发饭点提醒时，让 renderer 演一个短动画 */
  onMealTrigger(meal: MealKey): void;
}

export class MealScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly store: SettingsStore,
    private readonly notifier: Notifier,
    private readonly cb: MealCallbacks,
  ) {}

  start(): void {
    // 每 30 秒检查一次，足以避免错过 1 分钟内的触发点
    this.timer = setInterval(() => this.tick(), 30_000);
    // 启动时立刻检查一次，避免应用启动时刚好就是饭点的边界情况
    this.tick();
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    const settings = this.store.get();
    if (settings.remindersPaused) return;
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10); // YYYY-MM-DD
    const nowHHMM = `${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`;

    for (const key of ['breakfast', 'lunch', 'dinner'] as const) {
      const target = settings.mealTimes[key];
      if (this.shouldFire(target, nowHHMM, settings.lastMealFiredDate[key], todayStr)) {
        this.fire(key, todayStr);
      }
    }
  }

  /** 判定：目标时间已到 + 今天未触发 */
  private shouldFire(target: string, nowHHMM: string, lastDate: string | undefined, todayStr: string): boolean {
    if (target > nowHHMM) return false; // 未到点
    if (lastDate === todayStr) return false; // 今天已触发过
    return true;
  }

  private fire(meal: MealKey, todayStr: string): void {
    log.info(`fire meal=${meal} at ${new Date().toLocaleTimeString()}`);
    const settings = this.store.get();
    const sound = pickSound(settings);
    this.notifier.notify({
      title: '桌面小小英雄',
      body: `${MEAL_LABELS[meal]}时间到啦！记得按时吃饭哦～`,
      tag: `meal-${meal}`,
      silent: !settings.reminderSoundEnabled,
      ...(sound ? { sound } : {}),
    });
    // 招牌动作开关独立：开启时才让模型变大演动画
    if (settings.reminderShowOffEnabled) this.cb.onMealTrigger(meal);
    // 写入"今日已触发"
    this.store.patch({
      lastMealFiredDate: { ...settings.lastMealFiredDate, [meal]: todayStr },
    });
  }
}

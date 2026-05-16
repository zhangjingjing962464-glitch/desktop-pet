// MealScheduler 的"今天是否应该触发"判定逻辑

import { describe, it, expect } from 'vitest';

/** 复制自 meal-scheduler.ts 的私有方法（行为同步） */
function shouldFire(target: string, nowHHMM: string, lastDate: string | undefined, todayStr: string): boolean {
  if (target > nowHHMM) return false;
  if (lastDate === todayStr) return false;
  return true;
}

describe('shouldFire', () => {
  const today = '2026-05-16';

  it('未到点 → false', () => {
    expect(shouldFire('12:00', '11:59', undefined, today)).toBe(false);
  });

  it('刚到点 + 今天没触发 → true', () => {
    expect(shouldFire('12:00', '12:00', undefined, today)).toBe(true);
  });

  it('刚到点 + 今天已触发 → false', () => {
    expect(shouldFire('12:00', '12:00', today, today)).toBe(false);
  });

  it('过点但跨日（昨天触发） → true', () => {
    expect(shouldFire('07:30', '08:15', '2026-05-15', today)).toBe(true);
  });

  it('过点很久 + 今天未触发 → true', () => {
    expect(shouldFire('07:30', '22:00', undefined, today)).toBe(true);
  });
});

// 状态机类型定义

export type MainState = 'Idle' | 'Working' | 'Resting' | 'EatingReminder';

export interface PetFlags {
  dragging: boolean;
  remindersPaused: boolean;
  mealActive: boolean;
}

export interface PetSnapshot {
  readonly state: MainState;
  readonly flags: PetFlags;
  /** Working 中：剩余毫秒（target - now） */
  readonly workRemainingMs?: number;
  /** Resting 中：剩余毫秒 */
  readonly restRemainingMs?: number;
}

export const INITIAL_SNAPSHOT: PetSnapshot = {
  state: 'Idle',
  flags: { dragging: false, remindersPaused: false, mealActive: false },
};

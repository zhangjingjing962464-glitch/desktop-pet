// 时间常量

/** 随机动作触发间隔（毫秒） */
export const RANDOM_ACTION_MIN_MS = 5_000;
export const RANDOM_ACTION_MAX_MS = 10_000;

/** 拖拽判定阈值 */
export const DRAG_THRESHOLD_PX = 4;
export const DRAG_THRESHOLD_MS = 250;

/** 动作淡入淡出时长 */
export const CROSSFADE_DEFAULT_S = 0.25;
export const CROSSFADE_NATURAL_END_S = 0.15;
export const CROSSFADE_INTERRUPT_S = 0.4;

/** 同一动作冷却时长 */
export const ACTION_COOLDOWN_MS = 8_000;

/** 交互动作播放速度系数。<1 表示放慢（如 0.7 = 慢 ~43%），>1 加快。
 *  应用于 random scheduler 的单一动作 + 点击触发的 SOCIAL_ANIMS。
 *  Idle/Run 等循环动作不受影响（保持原速度看上去最自然） */
export const INTERACTION_TIME_SCALE = 0.7;

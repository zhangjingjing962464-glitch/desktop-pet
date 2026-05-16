// 物理尺寸常量与换算

/** 默认待机大小（厘米） */
export const DEFAULT_SIZE_CM = 1.5;

/** 最小/最大缩放范围 */
export const MIN_SIZE_CM = 1.5;
export const MAX_SIZE_CM = 2.75;

/** 缩放步长（cm） */
export const SIZE_STEP_CM = 0.25;

/** 模型周围预留的交互 padding（CSS 像素，旧字段保留兼容） */
export const INTERACTION_PADDING_PX = 16;

/** 窗口尺寸倍数：固定 5x，给所有动作充分余量。
 *  C 方案（idle 小动作大）已回退，因为窗口闪烁/切换问题不可接受。 */
export const WINDOW_SIZE_MULTIPLIER = 5;
export const WINDOW_SIZE_MULTIPLIER_IDLE = 5;
export const WINDOW_SIZE_MULTIPLIER_ACTION = 5;

/** 模型归一化后在场景中的高度（character-controller targetSize 同步用） */
export const MODEL_WORLD_HEIGHT = 0.95;

/** 计算 idle 状态总窗口像素（窗口小，可拖到屏幕边缘） */
export const computeWindowPx = (modelPx: number): number => Math.round(modelPx * WINDOW_SIZE_MULTIPLIER_IDLE);

/** 计算动作播放时总窗口像素（窗口大，容纳大幅动作） */
export const computeActionWindowPx = (modelPx: number): number =>
  Math.round(modelPx * WINDOW_SIZE_MULTIPLIER_ACTION);

/** 根据 cssSize 与 modelPx 计算相机正交 frustum 大小：
 *  视觉上 MODEL_WORLD_HEIGHT 个世界单位 = modelPx 个 CSS 像素
 *  → frustumSize = MODEL_WORLD_HEIGHT * cssSize / modelPx
 */
export const computeFrustumSize = (cssSize: number, modelPx: number): number =>
  modelPx > 0 ? MODEL_WORLD_HEIGHT * (cssSize / modelPx) : 1.5;

/** 休息时模型放大倍率（相对于待机大小） */
export const REST_SCALE_MULTIPLIER = 2.5;

/** PPI 默认值（macOS 内置 Retina 取近似 220；外接监视器估算 92~110） */
export const DEFAULT_PPI_RETINA = 220;
export const DEFAULT_PPI_EXTERNAL = 96;

/** 厘米转像素：1 inch = 2.54 cm */
export const cmToPx = (cm: number, ppi: number): number => Math.round((cm / 2.54) * ppi);
export const pxToCm = (px: number, ppi: number): number => (px * 2.54) / ppi;

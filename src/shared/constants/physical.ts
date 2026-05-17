// 物理尺寸常量与换算

/** 模型固定大小（厘米）。已废弃缩放功能，所有路径直接用此常量。 */
export const DEFAULT_SIZE_CM = 2;

/** 模型周围预留的交互 padding（CSS 像素，旧字段保留兼容） */
export const INTERACTION_PADDING_PX = 16;

/** 窗口尺寸倍数：固定 4.8x，给所有动作充分余量。
 *  C 方案（idle 小动作大）已回退，因为窗口闪烁/切换问题不可接受。 */
export const WINDOW_SIZE_MULTIPLIER = 4.8;
export const WINDOW_SIZE_MULTIPLIER_IDLE = 4.8;
export const WINDOW_SIZE_MULTIPLIER_ACTION = 4.8;

/** 模型归一化后在场景中的高度（character-controller targetSize 同步用） */
export const MODEL_WORLD_HEIGHT = 0.95;

/** 相机抬高系数：cameraY = frustumSize/2 × CAMERA_Y_LIFT_RATIO，
 *  让模型脚底（world y=0）稳定停在画布的 MODEL_FEET_VIEWPORT_RATIO 位置。
 *  系数 0~1：0=屏幕中线，1=贴底；当前 0.65 让模型整体偏画布下部。
 *  ⚠️ 与 scene-manager.ts 的 applyFrustum 数学耦合，修改时两处同步。 */
export const CAMERA_Y_LIFT_RATIO = 0.65;
/** 模型脚底在画布内的 y 比例（从顶起算）= 0.5 + CAMERA_Y_LIFT_RATIO/2。
 *  setSize 时用该比例对齐 y 轴锚点，避免缩放后脚底屏幕位置漂移。 */
export const MODEL_FEET_VIEWPORT_RATIO = 0.5 + CAMERA_Y_LIFT_RATIO / 2;

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

/** PPI 默认值（macOS 内置 Retina 取近似 220；外接监视器估算 92~110） */
export const DEFAULT_PPI_RETINA = 220;
export const DEFAULT_PPI_EXTERNAL = 96;

/** 厘米转像素：1 inch = 2.54 cm */
export const cmToPx = (cm: number, ppi: number): number => Math.round((cm / 2.54) * ppi);
export const pxToCm = (px: number, ppi: number): number => (px * 2.54) / ppi;

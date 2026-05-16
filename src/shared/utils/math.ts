// 数学工具：clamp / lerp / 度→弧度

export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const degToRad = (d: number): number => (d * Math.PI) / 180;

export const radToDeg = (r: number): number => (r * 180) / Math.PI;

export const randRange = (min: number, max: number): number => min + Math.random() * (max - min);

export const randInt = (min: number, max: number): number => Math.floor(randRange(min, max + 1));

/** 加权随机：items 必须非空 */
export function weightedPick<T>(items: ReadonlyArray<{ value: T; weight: number }>): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item.value;
  }
  const last = items[items.length - 1];
  if (!last) throw new Error('weightedPick called on empty array');
  return last.value;
}

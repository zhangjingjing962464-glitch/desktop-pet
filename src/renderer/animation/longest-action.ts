// 选取最长动画。优先 Finisher*，否则全集合最长

import * as THREE from 'three';

export function pickLongestAction(clips: ReadonlyMap<string, THREE.AnimationClip>): THREE.AnimationClip | null {
  if (clips.size === 0) return null;
  const all = Array.from(clips.values());
  const finishers = all.filter((c) => /^Finisher0[1-6]$/i.test(c.name));
  const pool = finishers.length > 0 ? finishers : all;
  let best = pool[0];
  if (!best) return null;
  for (const c of pool) {
    if (c.duration > best.duration) best = c;
  }
  return best;
}

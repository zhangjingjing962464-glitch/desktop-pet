// 骨骼工具：找 head/neck

import * as THREE from 'three';

const HEAD_PRIORITY = ['head_m', 'head_c', 'bip01_head', 'head', 'neck'] as const;

export function findHeadBone(root: THREE.Object3D): THREE.Bone | null {
  let best: { bone: THREE.Bone; priority: number } | null = null;
  root.traverse((obj) => {
    if (!(obj as THREE.Bone).isBone) return;
    const name = (obj.name ?? '').toLowerCase();
    for (let i = 0; i < HEAD_PRIORITY.length; i++) {
      if (name.includes(HEAD_PRIORITY[i] ?? '')) {
        if (best === null || i < best.priority) {
          best = { bone: obj as THREE.Bone, priority: i };
        }
        break;
      }
    }
  });
  return best !== null ? (best as { bone: THREE.Bone; priority: number }).bone : null;
}

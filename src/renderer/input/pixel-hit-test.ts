// 鼠标穿透：把模型 bbox 投影到屏幕，判断鼠标是否在投影矩形内。
// 远比 SkinnedMesh raycast 便宜，节流到 50ms / 次，滞回 80ms 防边缘抖动。

import * as THREE from 'three';

export interface HitTesterOptions {
  exitHysteresisMs: number;
  minIntervalMs: number;
  /** 屏幕投影矩形扩边像素，让边缘更容易点中 */
  paddingPx: number;
}

const DEFAULT_OPTS: HitTesterOptions = {
  exitHysteresisMs: 80,
  minIntervalMs: 50,
  paddingPx: 6,
};

const BBOX_CORNERS: ReadonlyArray<[number, number, number]> = [
  [0, 0, 0],
  [1, 0, 0],
  [0, 1, 0],
  [1, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [0, 1, 1],
  [1, 1, 1],
];

export class PixelHitTester {
  private readonly tmpBox = new THREE.Box3();
  private readonly tmpVec = new THREE.Vector3();
  private currentHit = false;
  private lastHitTime = 0;
  private lastUpdateTime = 0;
  private readonly opts: HitTesterOptions;
  private lastIgnoreState: boolean | null = null;
  private model: THREE.Object3D;

  constructor(
    private readonly camera: THREE.Camera,
    model: THREE.Object3D,
    opts: Partial<HitTesterOptions> = {},
  ) {
    this.opts = { ...DEFAULT_OPTS, ...opts };
    this.model = model;
  }

  update(mouseCssX: number, mouseCssY: number, viewportW: number, viewportH: number): boolean {
    const now = performance.now();
    if (now - this.lastUpdateTime < this.opts.minIntervalMs) return this.currentHit;
    this.lastUpdateTime = now;

    // 计算 bbox（不含 skinning 形变；够用了）
    this.tmpBox.setFromObject(this.model);
    if (this.tmpBox.isEmpty()) {
      this.currentHit = false;
      return false;
    }

    // 把 8 个角点投影到屏幕，取最小外接矩形
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [ux, uy, uz] of BBOX_CORNERS) {
      this.tmpVec.set(
        ux === 0 ? this.tmpBox.min.x : this.tmpBox.max.x,
        uy === 0 ? this.tmpBox.min.y : this.tmpBox.max.y,
        uz === 0 ? this.tmpBox.min.z : this.tmpBox.max.z,
      );
      this.tmpVec.project(this.camera);
      const cssX = ((this.tmpVec.x + 1) / 2) * viewportW;
      const cssY = ((-this.tmpVec.y + 1) / 2) * viewportH;
      if (cssX < minX) minX = cssX;
      if (cssX > maxX) maxX = cssX;
      if (cssY < minY) minY = cssY;
      if (cssY > maxY) maxY = cssY;
    }
    const padding = this.opts.paddingPx;
    const hit =
      mouseCssX >= minX - padding &&
      mouseCssX <= maxX + padding &&
      mouseCssY >= minY - padding &&
      mouseCssY <= maxY + padding;

    if (hit) {
      this.currentHit = true;
      this.lastHitTime = now;
    } else if (this.currentHit && now - this.lastHitTime > this.opts.exitHysteresisMs) {
      this.currentHit = false;
    }
    return this.currentHit;
  }

  isHit(): boolean {
    return this.currentHit;
  }

  async syncWindowState(): Promise<void> {
    const ignore = !this.currentHit;
    if (this.lastIgnoreState === ignore) return;
    this.lastIgnoreState = ignore;
    await window.pet.window.setIgnoreMouse({ ignore, forward: true });
  }

  setModel(model: THREE.Object3D): void {
    this.model = model;
  }
}

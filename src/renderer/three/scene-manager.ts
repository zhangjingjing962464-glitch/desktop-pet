// Three.js 场景管理：透明 WebGL + 正交相机

import * as THREE from 'three';
import { computeFrustumSize } from '@shared/constants/physical.js';

export class SceneManager {
  readonly scene: THREE.Scene;
  readonly camera: THREE.OrthographicCamera;
  readonly renderer: THREE.WebGLRenderer;
  /** 当前模型期望显示的 CSS 像素（= sizeCm 对应像素），用于自动算 frustum */
  private modelPx = 260;

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    this.scene.background = null;

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
    // 相机 y 在 applyFrustum 里根据 frustumSize 动态计算，让模型脚底（world y=0）
    // 稳定停在屏幕下部 ~85% 处。这里只先给个初值，等 applyFrustum 第一次跑会覆盖
    this.camera.position.set(0, 0.1, 2.0);
    this.camera.lookAt(0, 0.1, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(window.devicePixelRatio);
  }

  /** 由 app.ts 在切换大小时调，影响 frustum 让模型视觉上保持 sizeCm 大小 */
  setModelPx(px: number): void {
    this.modelPx = px;
    this.applyFrustum();
  }

  resize(cssWidth: number, cssHeight: number): void {
    this.renderer.setSize(cssWidth, cssHeight, false);
    this.applyFrustum();
  }

  private applyFrustum(): void {
    const cssSize = this.renderer.domElement.clientHeight;
    const frustumSize = computeFrustumSize(cssSize, this.modelPx);
    const aspect = this.renderer.domElement.clientWidth / Math.max(1, cssSize);
    this.camera.left = (-frustumSize * aspect) / 2;
    this.camera.right = (frustumSize * aspect) / 2;
    this.camera.top = frustumSize / 2;
    this.camera.bottom = -frustumSize / 2;
    // 把相机抬高让模型整体偏向窗口下部：
    //   系数 0~1 控制模型脚底在窗口高度的位置（1 = 完全贴底，0 = 屏幕中线）
    //   随 frustum 缩放保持稳定的相对位置（缩放/窗口变化时不漂）
    const cameraY = (frustumSize / 2) * 0.65;
    this.camera.position.y = cameraY;
    this.camera.lookAt(this.camera.position.x, cameraY, 0);
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}

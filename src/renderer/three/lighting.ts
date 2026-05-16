// 光照：环境光 + 顶向平行光（卡通色调）

import * as THREE from 'three';

export function setupLighting(scene: THREE.Scene): void {
  const ambient = new THREE.AmbientLight(0xffffff, 1.2);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(0.6, 1.5, 1.2);
  key.target.position.set(0, 0.5, 0);
  scene.add(key);
  scene.add(key.target);

  const rim = new THREE.DirectionalLight(0xa0c4ff, 0.6);
  rim.position.set(-1.2, 0.8, -0.6);
  scene.add(rim);
}

/** 调试：在场景中央放一个旋转立方体，证明 Three.js 渲染管线工作 */
export function addDebugCube(scene: THREE.Scene): THREE.Mesh {
  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.3, 0.3),
    new THREE.MeshStandardMaterial({ color: 0xff5577, metalness: 0.2, roughness: 0.4 }),
  );
  cube.position.set(0, 0.55, 0);
  cube.name = 'debug-cube';
  scene.add(cube);
  return cube;
}

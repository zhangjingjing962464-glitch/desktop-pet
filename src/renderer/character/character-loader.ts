// 用 GLTFLoader 加载角色，组装成 CharacterController

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CharacterController } from './character-controller.js';
import { createLogger } from '@shared/utils/logger.js';

const log = createLogger('character-loader');

export class CharacterLoader {
  private readonly loader = new GLTFLoader();
  /** 由 SceneManager 注入，传给 CharacterController 给纹理设置各向异性过滤 */
  maxAnisotropy = 1;

  async load(id: string, url: string, onProgress?: (p: number) => void): Promise<CharacterController> {
    const t0 = performance.now();
    log.info(`load start id=${id} url=${url}`);
    const gltf = await new Promise<GLTF>((resolve, reject) => {
      this.loader.load(
        url,
        (g) => resolve(g),
        (ev) => {
          if (onProgress && ev.lengthComputable) onProgress(ev.loaded / ev.total);
        },
        (err) => reject(err),
      );
    });
    const t1 = performance.now();
    log.info(`load done id=${id} fetch+parse=${(t1 - t0).toFixed(0)}ms`);
    const ctrl = CharacterController.create(gltf, id, { maxAnisotropy: this.maxAnisotropy });
    log.info(`controller created id=${id} total=${(performance.now() - t0).toFixed(0)}ms`);
    return ctrl;
  }
}

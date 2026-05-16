// 单个角色控制器：持有模型、骨骼、AnimationMixer、动画 clip 索引

import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { findHeadBone } from './bone-utils.js';
import { MODEL_WORLD_HEIGHT } from '@shared/constants/physical.js';
import { createLogger } from '@shared/utils/logger.js';

const log = createLogger('character-controller');

// 面部叠加层：覆盖所有 audit 出的命名变体
//   开头是面部部位词的：Eye/Eyes/Eyebrow/Eye_Base/Eye_Happy
//   或 Face_X：Face_Basic_Eyes/Face_Eyes/Face_Mouth_Base 等（带下划线后缀）
//   或表情切换词：Wink/Pleep/Weep/Fierce/Happy/Anger/Cloture/...
//   或 Base_X 前缀（yunara/star_guardian_lux 用）：Base_Eye/Base_Mouth/...
// 注意：单独的 `Face`（cafe_cuties_gwen 用）不命中——它是大块面部基底，
// 该被头发遮挡而非叠加在最前
const FACE_OVERLAY_RE = /^(Eye|Mouth|Brow|Lip|Blush|Wink|Pleep|Weep|Fierce|Happy|Anger|Cloture|Cloce|Closure|Evil|Eager|Uncomfortable|Finished|Violent|Dismayed|Shrewish|Stable|Shock|Shy|Shyness|Paste|Fang|Tear|Sweat|Face_|Base_(?:Eye|Mouth|Brow|Lip|Blush))/i;
// VFX/光晕/烟雾/粒子/速度线/舞台特效
const VFX_RE = /^(Glow|Smoke|Particle|VFX|Vfx|Smear|Smears|Stage)\d*|VFX$|Glow$|Smoke$/i;
// 带状/裙摆/披风/尾巴/羽翼：薄片几何，必须双面渲染。
// 用 \d*$ 锚定结尾，避免 Hairmetal/Hairband 等"Hair 开头的实色挂件"误命中
const DOUBLE_SIDE_RE = /^(Hair|Tail|Tails|Cloak|Cape|Skirt|Ribbon|Banner|Cloth|Flag|Sleeve|Sleeves|Veil|Wings?|Fur|Sash|Scarf|Lace|Feather|Spirit|Familiar|Foot)\d*$/i;
// 武器套件：多个 mesh 重叠几何（剪刀的刀片/把手/整体），同 z 时绘制顺序
// 不稳。统一前置 renderOrder 让武器先绘制完，再轮到角色身体/面部
const WEAPON_RE = /^(Scissors|Sword|Knife|Weapon|Staff|Spear|Bow|Axe|Dagger|Hammer|Lance|Sickle|Mace|Glaive|Halberd|Whip|Gun|Drum)\d*(Blade|Grip|Hilt|Handle|Tip|Edge|Sheath)?\d*$/i;

function isOverlayMaterial(name: string): boolean {
  if (!name) return false;
  return FACE_OVERLAY_RE.test(name) || VFX_RE.test(name);
}

function shouldDoubleSide(name: string): boolean {
  if (!name) return false;
  return DOUBLE_SIDE_RE.test(name);
}

/**
 * Indices-aware 几何 bbox：只算该 primitive 实际用到的顶点。
 *
 * Three.js GLTFLoader 把多 primitive 共享同一 POSITION buffer 的 GLB
 * 加载后，每个 SkinnedMesh 的 `geometry.attributes.position` 仍可能包含
 * 整个共享 buffer 的顶点（不限于本 primitive 用 indices 引用的子集）。
 * 直接 computeBoundingBox 会得到整个 buffer 的极值——chibi_star_guardian_ahri
 * 的 Body mesh 这样算出来 y=5303，实际 Body 真实顶点最高才 170.6。
 *
 * 该函数按 geometry.index 遍历真实用到的顶点算 bbox，与 audit-models.mjs
 * 用 BIN 段算的结果一致。
 */
function computePrimitiveLocalBox(mesh: THREE.Mesh | THREE.SkinnedMesh, out: THREE.Box3): THREE.Box3 {
  out.makeEmpty();
  const geom = mesh.geometry;
  const pos = geom?.attributes.position;
  if (!geom || !pos) return out;
  const v = new THREE.Vector3();
  const idx = geom.index;
  if (idx) {
    const arr = idx.array;
    for (let i = 0; i < arr.length; i++) {
      v.fromBufferAttribute(pos as THREE.BufferAttribute, arr[i] as number);
      out.expandByPoint(v);
    }
  } else {
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos as THREE.BufferAttribute, i);
      out.expandByPoint(v);
    }
  }
  return out;
}

/** 不计入身高基准的 mesh：尾巴/披风/挂件/光晕等远距/特效 mesh。
 *
 *   - Riot Chibi 模型 Body mesh 在不同皮肤里覆盖范围差异巨大：
 *     - 多数角色 Body 是完整身体（含头/头发）→ 134~170 cm 高
 *     - prestige_cafe_cuties_gwen 的 Body 只是 83 cm（头/发是单独 Hair mesh）
 *     - chibi_divine_sword_irelia 的 Body 只是 53.7（其余是 Hair/Skin/Metal）
 *     - chibi_yuumi 是只猫，Body 只是 42 cm
 *     仅靠 Body 选 refH 会让"局部 Body"模型缩放后整体大 2~3 倍。
 *   - 但又不能直接取所有 mesh 的合集 max——尾巴/披风/Familiar 长出体外
 *     很多，例如 SG Ahri 三条 Familiar 顶端 worldY=47，Tail1=76，会拉低
 *     一致性。
 *
 * 取舍：合并"实体身体 mesh"（除面部 overlay/VFX/带状挂件）的 bbox。
 */
const EXCLUDE_FROM_REF_RE = /^(Tail|Tails|Cloak|Cape|Banner|Wings?|Spirit|Familiar|Foot|Sash|Flag|Veil|Ribbon|Feather|Smears|Stage)\d*$/i;

/**
 * 收集模型用于缩放与摆位的参考几何 bbox。
 *
 * 用 indices-aware 的真实顶点 bbox（绕过 Three.js 共享 buffer 问题）。
 * 优先级：稳定身体 mesh 合并（排除面部 overlay / VFX / 远距挂件）
 *       > 所有 OPAQUE 合并 > 所有 mesh 合并。
 */
function pickReferenceBox(root: THREE.Object3D): THREE.Box3 | null {
  const stableBox = new THREE.Box3();
  const opaqueBox = new THREE.Box3();
  const allBox = new THREE.Box3();
  const tmp = new THREE.Box3();
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh & THREE.Mesh;
    if (!(m.isMesh || m.isSkinnedMesh)) return;
    computePrimitiveLocalBox(m, tmp);
    if (tmp.isEmpty()) return;
    allBox.union(tmp);
    const mat = Array.isArray(m.material) ? m.material[0] : m.material;
    const matName = mat?.name ?? '';
    if (mat && !mat.transparent) opaqueBox.union(tmp);
    if (
      !isOverlayMaterial(matName) &&
      !EXCLUDE_FROM_REF_RE.test(matName) &&
      !WEAPON_RE.test(matName)
    ) {
      stableBox.union(tmp);
    }
  });
  if (!stableBox.isEmpty()) return stableBox;
  if (!opaqueBox.isEmpty()) return opaqueBox;
  if (!allBox.isEmpty()) return allBox;
  return null;
}

/**
 * 给所有材质贴图开各向异性过滤，模型缩到窗口里时眼睛只占几像素，
 * 自动 mip 到低 mip 会让瞳孔/睫毛糊。各向异性过滤让 GPU 多采样保细节。
 *
 * 只动 anisotropy——不重置 minFilter / generateMipmaps / needsUpdate：
 *   GLTFLoader 已根据原图正确设置；强改 generateMipmaps=true 在 NPOT
 *   或已有 manual mip 的纹理上会让 texture upload 出错，eye 贴图采样
 *   到纯白（Three.js 默认占位）。
 */
function upgradeTextureFiltering(root: THREE.Object3D, maxAnisotropy: number): void {
  const seen = new Set<THREE.Texture>();
  root.traverse((obj) => {
    const m = obj as THREE.Mesh & THREE.SkinnedMesh;
    if (!(m.isMesh || m.isSkinnedMesh)) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      if (!mat) continue;
      for (const k of Object.keys(mat)) {
        const v = (mat as unknown as Record<string, unknown>)[k];
        if (!v || typeof v !== 'object') continue;
        const tex = v as { isTexture?: boolean } & THREE.Texture;
        if (!tex.isTexture) continue;
        if (seen.has(tex)) continue;
        seen.add(tex);
        tex.anisotropy = maxAnisotropy;
      }
    }
  });
}

export class CharacterController {
  readonly id: string;
  readonly root: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
  readonly clips: ReadonlyMap<string, THREE.AnimationClip>;
  readonly headBone: THREE.Bone | null;

  private constructor(
    id: string,
    root: THREE.Object3D,
    mixer: THREE.AnimationMixer,
    clips: Map<string, THREE.AnimationClip>,
    headBone: THREE.Bone | null,
  ) {
    this.id = id;
    this.root = root;
    this.mixer = mixer;
    this.clips = clips;
    this.headBone = headBone;
  }

  static create(gltf: GLTF, id: string, opts: { maxAnisotropy?: number } = {}): CharacterController {
    const root = gltf.scene;
    const maxAnisotropy = opts.maxAnisotropy ?? 1;
    // 确保 matrixWorld 是当前的，让后续可能的 setFromObject 也用最新 transform
    root.updateMatrixWorld(true);
    // 1. 找参考几何 bbox（mesh.geometry.boundingBox，不受 skinning/骨骼影响）
    //    soul_fighter_gwen 等模型的某条骨骼 matrixWorld 会把 setFromObject(root)
    //    撑到 11099，scale=1/10000 → 模型缩成一个点。
    //    用几何 bbox 反映 Riot 真实导出尺寸（Body 高度 80~170）
    const refBox = pickReferenceBox(root) ?? new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5));
    const size = refBox.getSize(new THREE.Vector3());
    const center = refBox.getCenter(new THREE.Vector3());
    const refHeight = size.y;
    const scale = refHeight > 0 ? MODEL_WORLD_HEIGHT / refHeight : 1;
    root.scale.setScalar(scale);

    // 2. 摆位：用参考 bbox（缩放前几何）算位置——脚踩 y=0、x/z 居中
    root.position.set(-center.x * scale, -refBox.min.y * scale, -center.z * scale);

    // 4. 还原 Riot Chibi 模型的渲染细节
    //    GLB 每个 mesh 拆成多个 primitive，GLTFLoader 转成独立 SkinnedMesh。
    //    Riot 用 material.extras.renderOrder 给所有 BLEND 材质排序，但单凭
    //    "有/无 renderOrder" 无法判断 depthWrite——Ahri 的 Hair/Tail/Body
    //    也带 renderOrder 却是基底，Morgana 的 Brow 没 renderOrder 却是叠加。
    //    改按材质命名识别：
    //      - 面部叠加（Eye/Mouth/Brow/Lip/Blush/Face_/表情词）+ VFX
    //        → 半透明叠加层，depthWrite=false，靠 renderOrder 排序
    //      - 其他 BLEND（头/身/发/耳/尾/手/角/披风/武器/挂件等）
    //        → 视觉近不透明的基底，depthWrite=true 才能正确互相遮挡，
    //          否则会出现"面部透出后脑头发""刘海透出眉眼"等问题
    const meshSummary: string[] = [];
    root.traverse((obj) => {
      const m = obj as THREE.Mesh & THREE.SkinnedMesh;
      if (!(m.isMesh || m.isSkinnedMesh)) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const mat0 = mats[0] as (THREE.Material & { userData?: Record<string, unknown> }) | undefined;
      const ud = mat0?.userData ?? {};
      const explicitOrder = typeof ud['renderOrder'] === 'number' ? (ud['renderOrder'] as number) : null;

      // Riot Chibi GLB 用 material.extras.visible 控制每个 primitive 是否默认显示，
      // 这是预置的表情/装备开关位（备用表情、未激活的小精灵等）。GLTFLoader 把
      // material.extras 完整拷进 material.userData，但不会把 visible 反映到
      // mesh.visible —— Three.js 默认所有 mesh.visible=true。
      //
      // 不应用 visible 的后果：
      //   chibi_star_guardian_ahri 的三个 Familiar* prim 应隐藏却被显示，几何叠
      //   在脸/眼前面，看上去就是"眼睛被白色饰品糊住"。
      //
      // 例外：以下两类 mesh 即使 visible=false 也保留显示，因为它们的"隐藏"
      // 实际依赖 Riot 客户端的 submeshVisibilityEvents 动画事件机制，Three.js
      // 不实现该机制，按 visible=false 死隐藏会让基础组件永远消失：
      //   1. WEAPON_RE 匹配（武器）：chibi_gwen 的唯一 Scissors prim 标了 false
      //   2. Face_X 命名（Riot 把脸拆成 Face_Eyes/Face_Mouth/Face_Brow 的 patch）：
      //      chibi_k_da_superfan_neeko 的 Face_Brow 标了 false → 眉毛永远不显示
      //   两个例外都不影响"Familiar/Eye_Pleep/Mouth_Wink"这些真正的备用表情 mesh
      //   （它们 visible=false 是为了避免与 Eye_Base 等"基础表情"重叠）
      const matNameForVisible = mat0?.name ?? '';
      const isDefaultPatch =
        WEAPON_RE.test(matNameForVisible) || /^Face_/i.test(matNameForVisible);
      if (ud['visible'] === false && !isDefaultPatch) m.visible = false;

      if (explicitOrder !== null) m.renderOrder = explicitOrder;

      // SkinnedMesh 的 boundingSphere 只按绑定姿势算，动画把肢体/头发/尾巴
      // 伸出包围球时会被正交相机剔除（看起来"缺一块"）。关掉视锥剔除可避免
      m.frustumCulled = false;

      const matName = mat0?.name ?? '';
      const overlay = isOverlayMaterial(matName);
      const ds = shouldDoubleSide(matName);
      const weapon = WEAPON_RE.test(matName);

      // 武器套件统一前置 renderOrder，避免 Scissors/ScissorsBlade/ScissorsGrip
      // 等多 mesh 同身位时绘制顺序不稳
      if (weapon && explicitOrder === null) {
        m.renderOrder = -1;
      }

      // 面部 overlay 强制 renderOrder=1000+，保留 GLB 内相对顺序（眉<嘴）
      //   - Star Guardian Ahri 的 Eye_Base ro=0 与 Body 同最低
      //   - Prestige Ahri 的 Eye_Base ro=21 但 Hair=20 polygonOffset 推前 z
      // 不论 GLB 数据怎样排，强制 overlay 在所有 mesh 之后绘制
      if (overlay) {
        m.renderOrder = 1000 + (explicitOrder ?? 0);
      }

      for (const mat of mats) {
        if (!mat) continue;
        if (mat.transparent) {
          // 叠加层不写深度（避免互相裁切）；基底写深度（避免面部透出后脑头发）
          mat.depthWrite = !overlay;
          if (overlay) {
            // 关键：面部 overlay 关掉 depthTest。
            // Eye/Brow/Mouth/Lip/Blush 等贴在 Body 表面，几何 z 与 Body
            // 表面 z 浮点上接近 → 部分眼部片元 depthTest 失败被裁掉，
            // 看上去就是"瞳孔/睫毛/高光细节丢失"。
            // Riot Chibi 设计意图正是用 renderOrder 强制叠加（"动漫大眼
            // 永远完整可见"），关 depthTest 让 renderOrder 单独决定层级。
            mat.depthTest = false;
          } else if (ds) {
            // BASE-DS（Hair/Tail/Cloak/Cape 等紧贴身体的带状几何）与 Body
            // 表面 z 接近，z-fight 表现为"头发透出脸"/"披风穿过身体"。
            // polygonOffset 让深度比较时略推前，Hair 能正确遮挡 Body 表面
            mat.polygonOffset = true;
            mat.polygonOffsetFactor = -1;
            mat.polygonOffsetUnits = -1;
          }
        }
        // 带状几何（尾巴/披风/飘带）薄片渲染：默认 FrontSide 从背面是透明的，
        // 跑步/转身时一面看下去整条尾巴/披风像平面
        if (ds) mat.side = THREE.DoubleSide;
      }

      const flags = [
        mat0?.transparent ? 'BLEND' : 'OPAQUE',
        `ro=${m.renderOrder}`,
        `dw=${mat0 && 'depthWrite' in mat0 ? (mat0 as THREE.Material).depthWrite : '-'}`,
        overlay ? 'overlay' : '',
        ds ? 'DS' : '',
        m.visible ? '' : 'HIDDEN',
      ].filter(Boolean).join(':');
      meshSummary.push(`${m.name}[${matName || '<noname>'}:${flags}]`);
    });

    // 5. 升级贴图过滤：缩到窗口里时眼睛只占几像素，自动 mip 到低 mip 会让
    //    瞳孔/睫毛糊。各向异性过滤让 GPU 用更多采样保留细节
    upgradeTextureFiltering(root, maxAnisotropy);

    const mixer = new THREE.AnimationMixer(root);
    const clips = new Map<string, THREE.AnimationClip>();
    for (const clip of gltf.animations) {
      clips.set(clip.name, clip);
    }
    const headBone = findHeadBone(root);

    log.info(
      `character loaded id=${id} animations=${clips.size} headBone=${headBone?.name ?? '<none>'} ` +
        `refH=${refHeight.toFixed(2)} scale=${scale.toFixed(4)} ` +
        `refBox=(${size.x.toFixed(2)},${size.y.toFixed(2)},${size.z.toFixed(2)}) ` +
        `rootPos=(${root.position.x.toFixed(3)},${root.position.y.toFixed(3)},${root.position.z.toFixed(3)})`,
    );
    log.info(`primitives(${meshSummary.length}): ${meshSummary.join(' | ')}`);
    return new CharacterController(id, root, mixer, clips, headBone);
  }

  attachTo(scene: THREE.Scene): void {
    scene.add(this.root);
  }

  detachFrom(scene: THREE.Scene): void {
    scene.remove(this.root);
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    this.root.traverse((obj) => {
      const mesh = obj as THREE.Mesh & THREE.SkinnedMesh;
      if (mesh.isMesh || mesh.isSkinnedMesh) {
        mesh.geometry?.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          if (!m) continue;
          for (const k of Object.keys(m)) {
            const v = (m as unknown as Record<string, unknown>)[k];
            if (v && typeof v === 'object' && (v as { isTexture?: boolean }).isTexture) {
              (v as THREE.Texture).dispose();
            }
          }
          m.dispose();
        }
      }
    });
  }
}

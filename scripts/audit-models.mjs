#!/usr/bin/env node
// 完整模型审查：解析 GLB BIN 段，按 indices 算每个 primitive 的真实几何 bbox
//
// 用法：node scripts/audit-models.mjs [model-name-substring]

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = resolve(__dirname, '..', 'assets/models');

const FACE_OVERLAY_RE = /^(Eye|Mouth|Brow|Lip|Blush|Wink|Pleep|Weep|Fierce|Happy|Anger|Cloture|Cloce|Closure|Evil|Eager|Uncomfortable|Finished|Violent|Dismayed|Shrewish|Stable|Shock|Shy|Shyness|Paste|Fang|Tear|Sweat|Face|Base_(?:Eye|Mouth|Brow|Lip|Blush))/i;
const VFX_RE = /^(Glow|Smoke|Particle|VFX|Vfx|Smear|Smears|Stage)\d*|VFX$|Glow$|Smoke$/i;
const DOUBLE_SIDE_RE = /^(Hair|Tail|Tails|Cloak|Cape|Skirt|Ribbon|Banner|Cloth|Flag|Sleeve|Sleeves|Veil|Wings?|Fur|Sash|Scarf|Lace|Feather|Spirit|Familiar|Foot)\d*$/i;

function classify(name) {
  if (FACE_OVERLAY_RE.test(name)) return 'OVL';
  if (VFX_RE.test(name)) return 'VFX';
  if (DOUBLE_SIDE_RE.test(name)) return 'DS ';
  return '   ';
}

function parseGlb(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('Not GLB');
  const jsonLen = view.getUint32(12, true);
  const jsonText = new TextDecoder().decode(
    new Uint8Array(buffer.buffer, buffer.byteOffset + 20, jsonLen),
  );
  const json = JSON.parse(jsonText);
  // BIN chunk 在 JSON 之后
  const binChunkOffset = 20 + jsonLen;
  const binChunkLen = view.getUint32(binChunkOffset, true);
  const binChunkType = view.getUint32(binChunkOffset + 4, true);
  if (binChunkType !== 0x004e4942) throw new Error('Second chunk is not BIN');
  const bin = new Uint8Array(buffer.buffer, buffer.byteOffset + binChunkOffset + 8, binChunkLen);
  return { json, bin };
}

const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function readAccessor(json, bin, accessorIdx) {
  const acc = json.accessors[accessorIdx];
  const bv = json.bufferViews[acc.bufferView];
  const byteOffset = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const componentBytes = COMPONENT_BYTES[acc.componentType];
  const itemCount = TYPE_COUNT[acc.type];
  const stride = bv.byteStride ?? componentBytes * itemCount;
  // 返回 (i) => [x, y, z] (or scalar for indices)
  const dv = new DataView(bin.buffer, bin.byteOffset + byteOffset, acc.count * stride);
  const read = {
    5120: (off) => dv.getInt8(off),
    5121: (off) => dv.getUint8(off),
    5122: (off) => dv.getInt16(off, true),
    5123: (off) => dv.getUint16(off, true),
    5125: (off) => dv.getUint32(off, true),
    5126: (off) => dv.getFloat32(off, true),
  }[acc.componentType];
  return {
    count: acc.count,
    type: acc.type,
    get(i) {
      const base = i * stride;
      if (itemCount === 1) return read(base);
      const r = new Array(itemCount);
      for (let k = 0; k < itemCount; k++) r[k] = read(base + k * componentBytes);
      return r;
    },
  };
}

function primitiveBbox(json, bin, primitive) {
  if (primitive.attributes?.POSITION === undefined) return null;
  const pos = readAccessor(json, bin, primitive.attributes.POSITION);
  let visit;
  if (primitive.indices !== undefined) {
    const idx = readAccessor(json, bin, primitive.indices);
    visit = function* () {
      for (let i = 0; i < idx.count; i++) yield idx.get(i);
    };
  } else {
    visit = function* () {
      for (let i = 0; i < pos.count; i++) yield i;
    };
  }
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const i of visit()) {
    const [x, y, z] = pos.get(i);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

function buildParentMap(nodes) {
  const m = new Map();
  for (const [i, n] of nodes.entries()) {
    for (const c of n.children ?? []) m.set(c, i);
  }
  return m;
}

function getAccumulatedScale(nodes, nodeIdx, parentMap) {
  const s = [1, 1, 1];
  let cur = nodeIdx;
  let safety = 0;
  while (cur !== undefined && cur !== -1 && safety++ < 100) {
    const n = nodes[cur];
    if (!n) break;
    const ns = n.scale ?? [1, 1, 1];
    s[0] *= ns[0];
    s[1] *= ns[1];
    s[2] *= ns[2];
    cur = parentMap.get(cur);
  }
  return s;
}

function inspect(filepath) {
  const { json, bin } = parseGlb(readFileSync(filepath));
  const nodes = json.nodes ?? [];
  const meshes = json.meshes ?? [];
  const materials = json.materials ?? [];
  const parentMap = buildParentMap(nodes);

  const meshNodePairs = [];
  for (const [i, n] of nodes.entries()) {
    if (typeof n.mesh === 'number') meshNodePairs.push({ nodeIdx: i, meshIdx: n.mesh });
  }

  const prims = [];
  for (const { nodeIdx, meshIdx } of meshNodePairs) {
    const mesh = meshes[meshIdx];
    if (!mesh) continue;
    const scale = getAccumulatedScale(nodes, nodeIdx, parentMap);
    for (const [pi, p] of (mesh.primitives ?? []).entries()) {
      const mat = typeof p.material === 'number' ? materials[p.material] : null;
      const matName = mat?.name ?? '<noname>';
      let bbox = null;
      try {
        bbox = primitiveBbox(json, bin, p);
      } catch (err) {
        bbox = null;
      }
      const geomSize = bbox
        ? [bbox.max[0] - bbox.min[0], bbox.max[1] - bbox.min[1], bbox.max[2] - bbox.min[2]]
        : null;
      const worldSize = geomSize
        ? [geomSize[0] * scale[0], geomSize[1] * scale[1], geomSize[2] * scale[2]]
        : null;
      prims.push({
        primitiveIdx: pi,
        matName,
        alphaMode: mat?.alphaMode ?? 'OPAQUE',
        doubleSided: !!mat?.doubleSided,
        renderOrder: mat?.extras?.renderOrder ?? null,
        visibleExtra: mat?.extras?.visible ?? null,
        geomSize,
        worldSize,
        nodeScale: scale,
        cls: classify(matName),
      });
    }
  }
  return { file: basename(filepath), prims };
}

function fmt(n, d = 1) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-';
  return n.toFixed(d);
}
function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function statistics(prims) {
  const ys = prims.map((p) => p.worldSize?.[1]).filter((v) => v && v > 0);
  if (!ys.length) return { median: 0, refH: 0, outliers: [], bodyMax: null };
  ys.sort((a, b) => a - b);
  const median = ys[Math.floor(ys.length / 2)];
  const limit = median * 3;
  const cleaned = ys.filter((h) => h <= limit);
  const refH = cleaned.length ? Math.max(...cleaned) : median;
  const outliers = prims.filter((p) => p.worldSize && p.worldSize[1] > limit);
  const bodies = prims.filter((p) => /^Body/i.test(p.matName) && p.worldSize);
  const bodyMax = bodies.length ? Math.max(...bodies.map((p) => p.worldSize[1])) : null;
  return { median, refH, outliers, bodyMax };
}

function printReport(r) {
  const s = statistics(r.prims);
  const flag = s.refH < 30 ? 'TINY' : s.refH > 400 ? 'HUGE' : 'OK';
  console.log(`\n=== ${r.file}  [${flag}] ===`);
  console.log(`  median=${fmt(s.median)}  refH(cleaned)=${fmt(s.refH)}  bodyMax=${fmt(s.bodyMax)}  outliers=${s.outliers.length}`);
  if (s.outliers.length) {
    console.log(`  ⚠ 离群 primitive (worldY > median*3):`);
    for (const p of s.outliers) {
      console.log(`     ${pad(p.matName, 24)} worldY=${fmt(p.worldSize[1])}  geomY=${fmt(p.geomSize?.[1])}  nodeScaleY=${fmt(p.nodeScale[1], 4)}`);
    }
  }
  console.log(`  primitives:`);
  for (const p of r.prims) {
    const w = p.worldSize ? `(${fmt(p.worldSize[0])},${fmt(p.worldSize[1])},${fmt(p.worldSize[2])})` : '-';
    const flags = `${p.alphaMode.padEnd(6)} ro=${String(p.renderOrder ?? '-').padEnd(3)} ${p.doubleSided ? 'DS' : 'SS'}`;
    console.log(`    ${p.cls} ${pad(p.matName, 24)} ${flags}  world=${w}`);
  }
}

const args = process.argv.slice(2);
const filter = args[0] ?? '';

if (!existsSync(MODELS_DIR)) {
  console.error('assets/models not found');
  process.exit(1);
}
const files = readdirSync(MODELS_DIR)
  .filter((f) => f.endsWith('.glb') && (!filter || f.includes(filter)))
  .map((f) => join(MODELS_DIR, f))
  .sort();
for (const f of files) {
  try {
    printReport(inspect(f));
  } catch (err) {
    console.error(`[ERROR] ${basename(f)}: ${err.message}`);
  }
}
console.log(`\n扫描 ${files.length} 个 GLB`);

#!/usr/bin/env node
// 扫描 assets/models 下所有 GLB，生成 assets/manifest/characters.json
// 元数据：id / baseId / displayName / filename / bytes / animations[{name,duration}] / hasHeadBone

import { readFileSync, readdirSync, writeFileSync, statSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const MODELS_DIR = resolve(PROJECT_ROOT, 'assets/models');
const MANIFEST_DIR = resolve(PROJECT_ROOT, 'assets/manifest');
const OUTPUT = resolve(MANIFEST_DIR, 'characters.json');

// 排除清单：GLB 物理文件保留，但不进 manifest（UI/切换列表都看不到）。
// 想恢复某角色，从此列表删除文件名后重跑 npm run scripts:manifest 即可
const EXCLUDED_FILES = new Set([
  'chibi_dawnbringer_riven.glb',
  'prestige_chibi_valiant_sword_riven.glb',
  'chibi_spirit_blossom_orianna.glb',
  'chibi_soul_fighter_gwen.glb', // skinning bbox 异常，缩放修复多次仍不稳
  'chibi_blood_moon_briar.glb',
  'chibi_shork_cosplay_briar.glb',
  'prestige_chibi_spirit_blossom_ahri.glb', // Eye_Base UV 错位指向脸肉色区，渲染成"白眼"
  'chibi_star_guardian_ahri.glb', // Familiar 隐藏后眼睛仍未恢复
  'chibi_spirit_blossom_lillia.glb',
  'chibi_spirit_blossom_yone.glb',
  'chibi_majestic_empress_morgana.glb',
  'chibi_dark_cosmic_lux.glb',
  'chibi_yuumi.glb',
  'chibi_crystal_rose_gwen.glb',
]);

function parseGlbJson(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const magic = view.getUint32(0, true);
  if (magic !== 0x46546c67) throw new Error('Not a valid GLB file');
  const jsonChunkLength = view.getUint32(12, true);
  const jsonText = new TextDecoder('utf-8').decode(
    new Uint8Array(buffer.buffer, buffer.byteOffset + 20, jsonChunkLength)
  );
  return JSON.parse(jsonText);
}

function computeAnimationDuration(animation, accessors) {
  let maxDuration = 0;
  for (const sampler of animation.samplers ?? []) {
    const acc = accessors[sampler.input];
    if (!acc || !acc.max || !acc.min) continue;
    const dur = (acc.max[0] ?? 0) - (acc.min[0] ?? 0);
    if (dur > maxDuration) maxDuration = dur;
  }
  return Number(maxDuration.toFixed(3));
}

function detectHeadBone(gltf) {
  const candidates = ['head', 'neck'];
  const nodes = gltf.nodes ?? [];
  for (const node of nodes) {
    const name = (node.name ?? '').toLowerCase();
    if (candidates.some((c) => name.includes(c))) return node.name;
  }
  return null;
}

/** 从文件名推导 baseId 与展示名
 *  chibi_lulu.glb → baseId 'lulu', displayName 'Lulu'
 *  chibi_star_guardian_lulu.glb → baseId 'lulu', displayName 'Star Guardian Lulu'
 *  prestige_chibi_spirit_blossom_ahri.glb → baseId 'ahri', displayName 'Prestige Spirit Blossom Ahri'
 *  victorious_duckbill.glb → baseId 'duckbill', displayName 'Victorious Duckbill'
 *  规则：以下划线切分，最后一段作为 baseId
 */
function parseFileName(filename) {
  const id = basename(filename, '.glb');
  const segments = id.split('_').filter((s) => s !== 'chibi');
  const baseId = segments[segments.length - 1] ?? id;
  const displayName = segments
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
  return { id, baseId, displayName };
}

function main() {
  if (!existsSync(MODELS_DIR)) {
    console.error(`assets/models 不存在，先跑 node scripts/link-models.mjs`);
    process.exit(1);
  }
  if (!existsSync(MANIFEST_DIR)) mkdirSync(MANIFEST_DIR, { recursive: true });

  const files = readdirSync(MODELS_DIR)
    .filter((f) => f.endsWith('.glb') && !EXCLUDED_FILES.has(f))
    .sort();

  const characters = [];
  for (const file of files) {
    const filepath = join(MODELS_DIR, file);
    const stat = statSync(filepath);
    try {
      const gltf = parseGlbJson(readFileSync(filepath));
      const { id, baseId, displayName } = parseFileName(file);
      characters.push({
        id,
        baseId,
        displayName,
        filename: file,
        bytes: stat.size,
        hasHeadBone: detectHeadBone(gltf) !== null,
        headBoneName: detectHeadBone(gltf),
        animations: (gltf.animations ?? []).map((a) => ({
          name: a.name ?? '<unnamed>',
          duration: computeAnimationDuration(a, gltf.accessors ?? []),
        })),
      });
    } catch (err) {
      console.error(`[manifest] 跳过 ${file}: ${err.message}`);
    }
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    totalBytes: characters.reduce((s, c) => s + c.bytes, 0),
    count: characters.length,
    characters,
  };

  writeFileSync(OUTPUT, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`[manifest] 写入 ${OUTPUT} (${characters.length} 个角色, ${(manifest.totalBytes / 1024 / 1024).toFixed(1)} MB)`);
}

main();

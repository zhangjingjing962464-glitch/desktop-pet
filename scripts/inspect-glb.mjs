#!/usr/bin/env node
// 解析 GLB 文件，列出动画名与时长
// 用法:
//   node scripts/inspect-glb.mjs path/to/file.glb     # 单文件
//   node scripts/inspect-glb.mjs --all                # 扫描 assets/models/*.glb

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = resolve(__dirname, '..', 'assets/models');

/**
 * 解析 GLB 二进制头部并取出 JSON chunk
 * GLB 格式：
 *   12-byte header (magic 'glTF' + version + total length)
 *   每个 chunk: 4-byte length + 4-byte type + payload
 */
function parseGlbJson(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const magic = view.getUint32(0, true);
  if (magic !== 0x46546c67) throw new Error('Not a valid GLB file');
  const version = view.getUint32(4, true);
  if (version !== 2) throw new Error(`Unsupported GLB version: ${version}`);

  const jsonChunkLength = view.getUint32(12, true);
  const jsonChunkType = view.getUint32(16, true);
  if (jsonChunkType !== 0x4e4f534a) throw new Error('First chunk is not JSON');

  const jsonText = new TextDecoder('utf-8').decode(
    new Uint8Array(buffer.buffer, buffer.byteOffset + 20, jsonChunkLength)
  );
  return JSON.parse(jsonText);
}

/** 单个 animation 的最大 duration：取所有 channel 引用的 input accessor 的 max[0]-min[0] 之最大值 */
function computeAnimationDuration(animation, accessors) {
  let maxDuration = 0;
  for (const sampler of animation.samplers ?? []) {
    const acc = accessors[sampler.input];
    if (!acc || !acc.max || !acc.min) continue;
    const dur = (acc.max[0] ?? 0) - (acc.min[0] ?? 0);
    if (dur > maxDuration) maxDuration = dur;
  }
  return maxDuration;
}

/** 检测骨骼里是否有 head/neck 命名节点 */
function detectHeadBone(gltf) {
  const candidates = ['head', 'neck', 'bip01_head', 'head_m', 'head_c'];
  const nodes = gltf.nodes ?? [];
  for (const node of nodes) {
    const name = (node.name ?? '').toLowerCase();
    if (candidates.some((c) => name.includes(c))) return node.name;
  }
  return null;
}

/** 检查文件，返回结构化报告 */
function inspectFile(filepath) {
  const buf = readFileSync(filepath);
  const gltf = parseGlbJson(buf);
  const animations = (gltf.animations ?? []).map((a) => ({
    name: a.name ?? '<unnamed>',
    duration: Number(computeAnimationDuration(a, gltf.accessors ?? []).toFixed(3)),
  }));
  return {
    file: basename(filepath),
    bytes: buf.byteLength,
    nodeCount: (gltf.nodes ?? []).length,
    meshCount: (gltf.meshes ?? []).length,
    skinCount: (gltf.skins ?? []).length,
    animationCount: animations.length,
    headBone: detectHeadBone(gltf),
    animations,
  };
}

function printReport(report) {
  console.log(`\n=== ${report.file} ===`);
  console.log(`  字节大小: ${(report.bytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  骨骼节点数: ${report.nodeCount}  Mesh: ${report.meshCount}  Skin: ${report.skinCount}`);
  console.log(`  头骨骼: ${report.headBone ?? '(未检测到)'}`);
  console.log(`  动画数: ${report.animationCount}`);
  for (const a of report.animations) {
    console.log(`    - ${a.name.padEnd(40)} ${a.duration.toFixed(2)}s`);
  }
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('用法: node scripts/inspect-glb.mjs <file.glb> | --all');
  process.exit(1);
}

if (args[0] === '--all') {
  if (!existsSync(MODELS_DIR)) {
    console.error(`assets/models 不存在，先跑 node scripts/link-models.mjs`);
    process.exit(1);
  }
  const files = readdirSync(MODELS_DIR)
    .filter((f) => f.endsWith('.glb'))
    .map((f) => join(MODELS_DIR, f))
    .sort();
  for (const file of files) {
    try {
      printReport(inspectFile(file));
    } catch (err) {
      console.error(`[ERROR] ${file}: ${err.message}`);
    }
  }
  console.log(`\n共扫描 ${files.length} 个 GLB 文件`);
} else {
  for (const file of args) {
    printReport(inspectFile(resolve(file)));
  }
}

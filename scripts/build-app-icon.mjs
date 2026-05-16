#!/usr/bin/env node
// 把 assets/icons/app-source.png 作为应用图标源图：
//   1. 用上方相邻像素复制覆盖左下"hyxcdb"水印区域
//   2. 调整为 1024x1024 居中（原图 560x562 接近正方形）
//   3. 输出 macOS .icns / iconset、各分辨率 PNG
//
// 用法：node scripts/build-app-icon.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { PNG } from 'pngjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = resolve(__dirname, '..', 'assets', 'icons');
const SRC = resolve(ICONS_DIR, 'app-source.png');

if (!existsSync(SRC)) {
  console.error(`source not found: ${SRC}`);
  process.exit(1);
}

// 1. 读源图
const srcPng = PNG.sync.read(readFileSync(SRC));
const { width: srcW, height: srcH, data: srcData } = srcPng;
console.log(`source: ${srcW}x${srcH}`);

// 2. 去水印：水印在左下角约 x=[60, 240] y=[470, 545]
//    用 y'=y-90（上方 90 像素）行的同列像素直接复制覆盖。
//    上方区域是角色裙摆 + 蓝色渐变，复制下来视觉自然。
const WATERMARK = { x0: 50, x1: 250, y0: 470, y1: 555 };
const REFLECT_SHIFT_Y = 90; // 上方多远的行用作覆盖
for (let y = WATERMARK.y0; y < Math.min(WATERMARK.y1, srcH); y++) {
  const srcY = y - REFLECT_SHIFT_Y;
  if (srcY < 0) continue;
  for (let x = WATERMARK.x0; x < Math.min(WATERMARK.x1, srcW); x++) {
    const dstIdx = (y * srcW + x) * 4;
    const srcIdx = (srcY * srcW + x) * 4;
    srcData[dstIdx] = srcData[srcIdx];
    srcData[dstIdx + 1] = srcData[srcIdx + 1];
    srcData[dstIdx + 2] = srcData[srcIdx + 2];
    srcData[dstIdx + 3] = srcData[srcIdx + 3];
  }
}
const cleaned = PNG.sync.write(srcPng);
const CLEANED_PATH = resolve(ICONS_DIR, 'app-cleaned.png');
writeFileSync(CLEANED_PATH, cleaned);
console.log(`cleaned (no watermark): ${CLEANED_PATH}`);

// 3. 用 sips 把图缩到各 macOS iconset 标准尺寸 + 1024x1024 主图
const sizes = [16, 32, 64, 128, 256, 512, 1024];
const SETS_DIR = resolve(ICONS_DIR, 'AppIcon.iconset');
if (existsSync(SETS_DIR)) rmSync(SETS_DIR, { recursive: true, force: true });
mkdirSync(SETS_DIR, { recursive: true });

function sips(args) {
  const r = spawnSync('sips', args, { encoding: 'utf-8' });
  if (r.status !== 0) {
    console.error(`sips ${args.join(' ')} failed:`, r.stderr || r.stdout);
    process.exit(1);
  }
  return r.stdout;
}

// iconset 文件命名规则
function iconName(size, retina) {
  if (retina) return `icon_${size / 2}x${size / 2}@2x.png`;
  return `icon_${size}x${size}.png`;
}

// sips -z H W 强制 NxN 尺寸（非保持比例），原图 560x562 拉到正方形 < 0.4% 形变，
// 视觉上图片铺满整个图标无 padding，比 -Z 等比缩放后留边更接近"铺满"语义
for (const size of sizes) {
  const out1 = resolve(SETS_DIR, `icon_${size}x${size}.png`);
  sips(['-z', String(size), String(size), CLEANED_PATH, '--out', out1]);
}
for (const half of [16, 32, 128, 256, 512]) {
  const size = half * 2;
  const out2 = resolve(SETS_DIR, `icon_${half}x${half}@2x.png`);
  sips(['-z', String(size), String(size), CLEANED_PATH, '--out', out2]);
}

// 主体 1024 备份（同样铺满）
const MAIN_PATH = resolve(ICONS_DIR, 'icon.png');
sips(['-z', '1024', '1024', CLEANED_PATH, '--out', MAIN_PATH]);
console.log(`main icon: ${MAIN_PATH}`);

// 4. 用 iconutil 合成 .icns（macOS only）
const ICNS_PATH = resolve(ICONS_DIR, 'icon.icns');
const iconutil = spawnSync('iconutil', ['-c', 'icns', SETS_DIR, '-o', ICNS_PATH], { encoding: 'utf-8' });
if (iconutil.status !== 0) {
  console.error('iconutil failed:', iconutil.stderr);
} else {
  console.log(`icns: ${ICNS_PATH}`);
}

console.log('done.');

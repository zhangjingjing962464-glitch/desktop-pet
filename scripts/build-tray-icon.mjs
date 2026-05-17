#!/usr/bin/env node
// 从 assets/icons/icon.png 衍生 macOS Template Image 托盘图标。
//
// icon.png 是带蓝色渐变背景的方形角色头像（非透明立绘），所以用"亮度双阈值切片"策略：
//   - 暗细节（眼线/嘴/装饰，luminance < DARK_THRESHOLD）→ 实心黑色
//   - 亮细节（头发/皮肤亮部/白色高光，luminance > LIGHT_THRESHOLD）→ 实心黑色
//   - 中等亮度（蓝色背景）→ 透明剔除
// 在过渡区做线性渐变（FALLOFF）保证抗锯齿。
//
// 流水线：
//   1. lanczos3 两段缩放：1024 → 256 → 16/32/48（避免极端降采样的 ringing）
//   2. 在 256 中间尺寸做双阈值切片，得到 macOS Template Image（RGB=0，alpha=形状）
//   3. 缩到 16/32/48 输出
//
// 输出：assets/icons/tray.png (16) / tray@2x.png (32) / tray@3x.png (48)
// 用法：node scripts/build-tray-icon.mjs

import sharp from 'sharp';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = resolve(__dirname, '..', 'assets', 'icons');
const SRC = resolve(ICONS_DIR, 'icon.png');

// === 可调参数 ===
const MID_SIZE        = 256;  // 两段缩放的中间尺寸
const DARK_THRESHOLD  = 70;   // 亮度 < 70 视作暗细节（前景）
const LIGHT_THRESHOLD = 210;  // 亮度 > 210 视作亮细节（前景）
const FALLOFF         = 30;   // 阈值过渡区宽度（保证抗锯齿）
const OUTPUTS = [
  ['tray.png',    16],
  ['tray@2x.png', 32],
  ['tray@3x.png', 48],
];

// 用 ITU-R BT.601 luminance 公式 + 双阈值切片提取剪影
// RGB 置 0（macOS Template Image 规范），alpha 由亮度决定
function applyDualThreshold(rgba, size) {
  const out = Buffer.from(rgba);
  for (let i = 0; i < size * size; i++) {
    const idx = i * 4;
    const r = out[idx], g = out[idx + 1], b = out[idx + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    let a;
    if (lum < DARK_THRESHOLD) {
      // 暗细节：DARK_THRESHOLD 到 DARK_THRESHOLD-FALLOFF 过渡到实心
      a = Math.min(255, ((DARK_THRESHOLD - lum) / FALLOFF) * 255);
    } else if (lum > LIGHT_THRESHOLD) {
      // 亮细节：LIGHT_THRESHOLD 到 LIGHT_THRESHOLD+FALLOFF 过渡到实心
      a = Math.min(255, ((lum - LIGHT_THRESHOLD) / FALLOFF) * 255);
    } else {
      a = 0;
    }
    out[idx]     = 0;
    out[idx + 1] = 0;
    out[idx + 2] = 0;
    out[idx + 3] = Math.max(0, Math.round(a));
  }
  return out;
}

async function main() {
  if (!existsSync(SRC)) {
    console.error(`source icon not found: ${SRC} — 请先生成应用图标`);
    process.exit(1);
  }

  // 1. 缩到中间尺寸（lanczos3）
  const mid = await sharp(SRC)
    .removeAlpha()  // icon.png 可能本来就没 alpha，统一去掉避免歧义
    .resize(MID_SIZE, MID_SIZE, { kernel: 'lanczos3', fit: 'fill' })
    .ensureAlpha()  // 再补上 alpha = 255
    .raw()
    .toBuffer({ resolveWithObject: true });
  console.log(`mid: ${mid.info.width}x${mid.info.height} (${mid.info.channels} ch)`);

  // 2. 双阈值切片 → Template Image buffer
  const tpl = applyDualThreshold(mid.data, MID_SIZE);

  // 3. 从中间尺寸缩到 16/32/48 输出
  for (const [name, sz] of OUTPUTS) {
    const out = resolve(ICONS_DIR, name);
    await sharp(tpl, { raw: { width: MID_SIZE, height: MID_SIZE, channels: 4 } })
      .resize(sz, sz, { kernel: 'lanczos3', fit: 'fill' })
      .png({ compressionLevel: 9, palette: false, force: true })
      .toFile(out);
    console.log(`wrote ${out} (${sz}x${sz})`);
  }
  console.log('done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

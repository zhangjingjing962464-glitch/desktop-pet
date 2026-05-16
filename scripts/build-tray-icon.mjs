#!/usr/bin/env node
// 生成托盘图标：纯白 alpha mask 模板图（macOS Tray 会自动适配明暗主题）。
// 设计：一颗五角星（star guardian 主题，"小小英雄"的英雄标识）。
// 输出：assets/icons/tray.png (16x16) + tray@2x.png (32x32) + tray@3x.png (48x48)
//
// 用法：node scripts/build-tray-icon.mjs
//
// 用纯 Node + pngjs 绘制，无外部图像库依赖（pngjs 项目本来就在 node_modules）。

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'assets', 'icons');

// 计算五角星 10 个顶点（5 外 5 内交替）的归一化坐标（中心 0,0，外接圆半径 1）
function starVertices(outerR, innerR) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
  }
  return pts;
}

/** 点在多边形内（射线法） */
function pointInPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y;
    const xj = pts[j].x, yj = pts[j].y;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function draw(size) {
  const png = new PNG({ width: size, height: size });
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  // 圆形外环（描边）：从外径到内径之间填充
  const outerR = size * 0.48;
  const innerR = outerR - Math.max(1.0, size * 0.085); // 环宽随尺寸缩放
  // 圆内五角星（实心）
  const starOuter = size * 0.27;
  const starInner = starOuter * 0.42;
  const starPts = starVertices(starOuter, starInner).map((p) => ({ x: p.x + cx, y: p.y + cy }));

  // 4x super-sampling 抗锯齿
  const samples = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let covered = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const px = x + (sx + 0.5) / samples;
          const py = y + (sy + 0.5) / samples;
          // 圆环：在内外圆之间
          const dx = px - cx;
          const dy = py - cy;
          const dist = Math.hypot(dx, dy);
          const inRing = dist <= outerR && dist >= innerR;
          const inStar = pointInPolygon(px, py, starPts);
          if (inRing || inStar) covered++;
        }
      }
      const alpha = Math.round((covered / (samples * samples)) * 255);
      const idx = (y * size + x) * 4;
      // 模板图：RGB 设白色，alpha 控制覆盖
      png.data[idx] = 255;
      png.data[idx + 1] = 255;
      png.data[idx + 2] = 255;
      png.data[idx + 3] = alpha;
    }
  }
  return PNG.sync.write(png);
}

const sizes = [
  { size: 16, name: 'tray.png' },
  { size: 32, name: 'tray@2x.png' },
  { size: 48, name: 'tray@3x.png' },
];

for (const { size, name } of sizes) {
  const buf = draw(size);
  const out = resolve(OUT_DIR, name);
  writeFileSync(out, buf);
  console.log(`wrote ${out} (${size}x${size}, ${buf.length} bytes)`);
}

#!/usr/bin/env node
// 创建 assets/models 软链接，指向用户的原始模型目录
// 用法: node scripts/link-models.mjs [可选自定义源目录]

import { existsSync, lstatSync, symlinkSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const DEFAULT_SOURCE = '/Users/chin.jing1998/项目研究/桌面宠物/小小英雄模型';
const LINK_PATH = resolve(PROJECT_ROOT, 'assets/models');

const source = process.argv[2] ?? DEFAULT_SOURCE;

if (!existsSync(source)) {
  console.error(`[link-models] 源目录不存在: ${source}`);
  process.exit(1);
}

if (existsSync(LINK_PATH)) {
  const stat = lstatSync(LINK_PATH);
  if (stat.isSymbolicLink()) {
    unlinkSync(LINK_PATH);
  } else {
    console.error(`[link-models] ${LINK_PATH} 已存在且不是软链接，请手动处理`);
    process.exit(1);
  }
}

symlinkSync(source, LINK_PATH, 'dir');
console.log(`[link-models] OK: ${LINK_PATH} -> ${source}`);

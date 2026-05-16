#!/usr/bin/env node
// npm install 后自动跑：确保 assets/models 软链接存在，否则提示用户

import { existsSync, lstatSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const LINK_PATH = resolve(PROJECT_ROOT, 'assets/models');

if (!existsSync(LINK_PATH)) {
  console.warn(`\n[postinstall] 注意：assets/models 不存在`);
  console.warn(`  请先跑：node scripts/link-models.mjs`);
  console.warn(`  默认源目录：/Users/chin.jing1998/项目研究/桌面宠物/小小英雄模型`);
  process.exit(0);
}

if (lstatSync(LINK_PATH).isSymbolicLink()) {
  console.log(`[postinstall] assets/models 软链接已就绪`);
} else {
  console.log(`[postinstall] assets/models 是普通目录（非软链接，也 OK）`);
}

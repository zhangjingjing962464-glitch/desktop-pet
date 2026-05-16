// Electron 主进程入口

import { bootstrap } from './bootstrap.js';
import { createLogger } from '@shared/utils/logger.js';

const log = createLogger('main');

bootstrap().catch((err) => {
  log.error('bootstrap failed', err);
  process.exit(1);
});

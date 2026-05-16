// renderer 入口

import { startApp } from './app.js';

startApp().catch((err) => {
  console.error('[renderer] startApp failed', err);
});

// 注册自定义 app:// 协议，让 renderer 能通过 fetch/GLTFLoader 加载本地 GLB
// 用法：renderer 把 url 写成 'app://models/chibi_lulu.glb'

import { protocol, net } from 'electron';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createLogger } from '@shared/utils/logger.js';

const log = createLogger('asset-protocol');
const __dirname = dirname(fileURLToPath(import.meta.url));

/** 候选路径（dev → prod） */
function resolveModelFile(filename: string): string | null {
  const candidates = [
    resolve(__dirname, '../../assets/models', filename),
    resolve(process.cwd(), 'assets/models', filename),
    resolve(process.resourcesPath ?? '', 'models', filename),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

/** 必须在 app.ready 之前调用 */
export function registerAssetSchemeAsPrivileged(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'app',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        bypassCSP: false,
      },
    },
  ]);
}

/** 必须在 app.ready 之后调用 */
export function registerAssetProtocolHandler(): void {
  protocol.handle('app', async (request) => {
    try {
      const url = new URL(request.url);
      // app://models/<filename>
      if (url.host === 'models') {
        const filename = decodeURIComponent(url.pathname.replace(/^\//, ''));
        const abs = resolveModelFile(filename);
        if (!abs) {
          log.warn(`app://models GLB not found: ${filename}`);
          return new Response('not found', { status: 404 });
        }
        return net.fetch(pathToFileURL(abs).toString());
      }
      return new Response('unsupported host', { status: 404 });
    } catch (err) {
      log.error('app protocol handler error', err);
      return new Response('internal error', { status: 500 });
    }
  });
}

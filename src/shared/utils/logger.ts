// 轻量结构化日志，主/渲染共用。仅 ERROR/WARN 会被 eslint 放行。

type Level = 'debug' | 'info' | 'warn' | 'error';

interface LoggerOptions {
  tag: string;
  level?: Level;
}

const LEVEL_ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function envLevel(): Level {
  // Node 环境读 process.env；浏览器环境读 import.meta.env（vite 注入）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env: any = typeof process !== 'undefined' ? process.env : (import.meta as any).env;
  const raw = (env?.LOG_LEVEL ?? env?.VITE_LOG_LEVEL ?? 'info').toLowerCase() as Level;
  return raw in LEVEL_ORDER ? raw : 'info';
}

export class Logger {
  private readonly tag: string;
  private readonly threshold: number;

  constructor(opts: LoggerOptions) {
    this.tag = opts.tag;
    this.threshold = LEVEL_ORDER[opts.level ?? envLevel()];
  }

  debug(msg: string, data?: unknown): void {
    this.write('debug', msg, data);
  }
  info(msg: string, data?: unknown): void {
    this.write('info', msg, data);
  }
  warn(msg: string, data?: unknown): void {
    this.write('warn', msg, data);
  }
  error(msg: string, err?: unknown): void {
    this.write('error', msg, err);
  }

  private write(level: Level, msg: string, data?: unknown): void {
    if (LEVEL_ORDER[level] < this.threshold) return;
    const prefix = `[${level.toUpperCase()}][${this.tag}]`;
    if (level === 'error') console.error(prefix, msg, data ?? '');
    else if (level === 'warn') console.warn(prefix, msg, data ?? '');
    else console.warn(prefix, msg, data ?? ''); // eslint-disable-line no-console
  }
}

export const createLogger = (tag: string, level?: Level): Logger => new Logger(level === undefined ? { tag } : { tag, level });

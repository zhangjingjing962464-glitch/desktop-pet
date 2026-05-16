// 系统通知封装

import { Notification } from 'electron';
import { createLogger } from '@shared/utils/logger.js';
import type { NotifyPayload } from '@shared/ipc/contracts.js';

const log = createLogger('notifier');

export class Notifier {
  private readonly tagToNotification = new Map<string, Notification>();

  /** macOS 首次启动用 silent 通知触发系统授权弹窗 */
  ensurePermission(): void {
    if (!Notification.isSupported()) {
      log.warn('当前环境不支持系统通知');
      return;
    }
    try {
      const n = new Notification({ title: '桌面小小英雄', body: '准备就绪', silent: true });
      n.show();
      setTimeout(() => n.close(), 50);
    } catch (err) {
      log.warn('权限测试通知失败', err);
    }
  }

  notify(p: NotifyPayload): void {
    if (!Notification.isSupported()) return;
    if (p.tag) {
      this.tagToNotification.get(p.tag)?.close();
    }
    const opts: Electron.NotificationConstructorOptions = {
      title: p.title,
      body: p.body,
      silent: p.silent ?? false,
    };
    // macOS NSSound name（如 'Glass'）或文件绝对路径都支持
    if (p.sound && !p.silent) opts.sound = p.sound;
    const n = new Notification(opts);
    n.show();
    if (p.tag) this.tagToNotification.set(p.tag, n);
  }

  cancel(tag: string): void {
    this.tagToNotification.get(tag)?.close();
    this.tagToNotification.delete(tag);
  }
}

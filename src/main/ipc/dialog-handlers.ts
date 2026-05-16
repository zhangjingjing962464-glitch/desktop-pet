// 对话框 / 音频试听 IPC handlers

import { ipcMain, dialog, type BrowserWindow } from 'electron';
import { spawn } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { existsSync } from 'node:fs';
import { IPC } from '@shared/ipc/channels.js';
import { createLogger } from '@shared/utils/logger.js';

const log = createLogger('dialog');

export function registerDialogHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC.dialog.pickAudio, async () => {
    const win = getMainWindow();
    const opts: Electron.OpenDialogOptions = {
      title: '选择提示音文件',
      filters: [
        { name: '音频文件', extensions: ['wav', 'mp3', 'aiff', 'caf', 'm4a', 'aac'] },
      ],
      properties: ['openFile'],
    };
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    if (res.canceled || res.filePaths.length === 0) return null;
    return res.filePaths[0];
  });

  // 试听：直接调系统播放器播音频文件
  //   macOS：afplay /System/Library/Sounds/{Glass,Hero,...}.aiff 或自定义绝对路径
  //   Notification.sound 在 silent body 时部分系统不展示也不播声，afplay 更可靠
  ipcMain.handle(IPC.audio.preview, (_e, sound: string) => {
    if (!sound) return;
    let filePath = sound;
    if (!isAbsolute(filePath)) {
      // macOS NSSound 系统名 → 对应文件
      if (process.platform === 'darwin') {
        filePath = `/System/Library/Sounds/${sound}.aiff`;
      } else {
        log.warn(`preview: 非 macOS 平台不支持系统音名 "${sound}"`);
        return;
      }
    }
    if (!existsSync(filePath)) {
      log.warn(`preview: file not found ${filePath}`);
      return;
    }
    try {
      if (process.platform === 'darwin') {
        const child = spawn('/usr/bin/afplay', [filePath], { detached: true, stdio: 'ignore' });
        child.unref();
      } else if (process.platform === 'win32') {
        const ps = `Add-Type -AssemblyName System.Speech; (New-Object System.Media.SoundPlayer "${filePath}").PlaySync()`;
        const child = spawn('powershell', ['-NoProfile', '-Command', ps], { detached: true, stdio: 'ignore' });
        child.unref();
      } else {
        const child = spawn('paplay', [filePath], { detached: true, stdio: 'ignore' });
        child.unref();
      }
    } catch (err) {
      log.warn('preview spawn failed', err);
    }
  });
}

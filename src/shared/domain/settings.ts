// 用户设置 schema（zod + 默认值）

import { z } from 'zod';
import { DEFAULT_SIZE_CM } from '../constants/physical.js';
import { DEFAULT_CHARACTER_ID } from './character.js';

export const SettingsSchema = z.object({
  selectedCharacterId: z.string().default(DEFAULT_CHARACTER_ID),
  sizeCm: z.number().default(DEFAULT_SIZE_CM),
  autoLaunch: z.boolean().default(false),
  /** 设置/界面主题：'light' | 'dark' | 'system' */
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  /** 窗口层级。false=最底层（'desktop' level，被其他窗口盖住，但仍在桌面壁纸上），
   *  true=最顶层（'screen-saver' level，永远在所有窗口之上）。默认 false，
   *  右键菜单"置顶"可切换 */
  windowOnTop: z.boolean().default(false),
  windowPosition: z.object({ x: z.number(), y: z.number() }).optional(),
  shortcuts: z
    .object({
      toggleVisible: z.string().default('CommandOrControl+Shift+H'),
    })
    .default({
      toggleVisible: 'CommandOrControl+Shift+H',
    }),
});

export type UserSettings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: UserSettings = SettingsSchema.parse({});

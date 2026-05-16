// 用户设置 schema（zod + 默认值）

import { z } from 'zod';
import {
  DEFAULT_WORK_MINUTES,
  DEFAULT_REST_MINUTES,
  DEFAULT_MEAL_TIMES,
  MIN_WORK_MINUTES,
  MAX_WORK_MINUTES,
  MIN_REST_MINUTES,
  MAX_REST_MINUTES,
} from '../constants/time.js';
import { DEFAULT_SIZE_CM, MIN_SIZE_CM, MAX_SIZE_CM } from '../constants/physical.js';
import { DEFAULT_CHARACTER_ID } from './character.js';

const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export const SettingsSchema = z.object({
  selectedCharacterId: z.string().default(DEFAULT_CHARACTER_ID),
  sizeCm: z.number().min(MIN_SIZE_CM).max(MAX_SIZE_CM).default(DEFAULT_SIZE_CM),
  workMinutes: z.number().int().min(MIN_WORK_MINUTES).max(MAX_WORK_MINUTES).default(DEFAULT_WORK_MINUTES),
  restMinutes: z.number().int().min(MIN_REST_MINUTES).max(MAX_REST_MINUTES).default(DEFAULT_REST_MINUTES),
  mealTimes: z
    .object({
      breakfast: z.string().regex(HHMM_REGEX).default(DEFAULT_MEAL_TIMES.breakfast),
      lunch: z.string().regex(HHMM_REGEX).default(DEFAULT_MEAL_TIMES.lunch),
      dinner: z.string().regex(HHMM_REGEX).default(DEFAULT_MEAL_TIMES.dinner),
    })
    .default({ ...DEFAULT_MEAL_TIMES }),
  remindersPaused: z.boolean().default(false),
  autoLaunch: z.boolean().default(false),
  /** 提醒声音开关：发送系统通知 + 提示音 */
  reminderSoundEnabled: z.boolean().default(true),
  /** 招牌动作开关：模型放最大 + 切到最顶层，播招牌动作直到休息结束。
   *  与 reminderSoundEnabled 互不影响，可同时开启 */
  reminderShowOffEnabled: z.boolean().default(false),
  /** 提示音选择：macOS NSSound 系统名 + 'custom'（用 reminderCustomSoundPath）。
   *  系统名见 /System/Library/Sounds */
  reminderSoundName: z
    .enum(['Glass', 'Hero', 'Funk', 'Pop', 'Ping', 'Submarine', 'Bottle', 'Tink', 'custom'])
    .default('Glass'),
  /** 自定义提示音绝对文件路径（reminderSoundName='custom' 时使用） */
  reminderCustomSoundPath: z.string().optional(),
  /** 设置/界面主题：'light' | 'dark' | 'system' */
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  /** 窗口层级。false=最底层（'desktop' level，被其他窗口盖住，但仍在桌面壁纸上），
   *  true=最顶层（'screen-saver' level，永远在所有窗口之上）。默认 false，
   *  右键菜单"置顶"可切换 */
  windowOnTop: z.boolean().default(false),
  windowPosition: z.object({ x: z.number(), y: z.number() }).optional(),
  lastMealFiredDate: z
    .object({
      breakfast: z.string().optional(),
      lunch: z.string().optional(),
      dinner: z.string().optional(),
    })
    .default({}),
  shortcuts: z
    .object({
      pauseReminders: z.string().default('CommandOrControl+Shift+P'),
      toggleVisible: z.string().default('CommandOrControl+Shift+H'),
      openSettings: z.string().default('CommandOrControl+Shift+,'),
    })
    .default({
      pauseReminders: 'CommandOrControl+Shift+P',
      toggleVisible: 'CommandOrControl+Shift+H',
      openSettings: 'CommandOrControl+Shift+,',
    }),
});

export type UserSettings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: UserSettings = SettingsSchema.parse({});

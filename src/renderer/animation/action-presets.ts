// 拼接动作预置：5 个组合 + 单一动作权重表

import type { ActionSequence } from './action-sequence.js';

/** 大幅跳跃/位移动作黑名单：随机调度不再触发它们。
 *  Dive/Recall 会让模型上窜或瞬移；如果以后想全屏铺开，把 Finisher 也加进来。 */
export const ACTION_BLACKLIST: ReadonlySet<string> = new Set<string>([
  'Dive_In',
  'Dive_Out',
  'Recall',
  'Recall_Winddown',
]);

/** 5 个拼接动作 */
export const SEQUENCE_PRESETS: ReadonlyArray<ActionSequence> = [
  {
    id: 'excited-greet',
    weight: 1.5,
    requiredAnims: ['Greeting', 'Laugh', 'Dance_In', 'Dance_Loop', 'Idle_In'],
    steps: [
      { name: 'Greeting', loop: 'once', crossFade: 0.2 },
      { name: 'Laugh', loop: 'once', crossFade: 0.2 },
      { name: 'Dance_In', loop: 'once', crossFade: 0.25 },
      { name: 'Dance_Loop', loop: 'loop', loopDuration: 2.0, crossFade: 0.25 },
      { name: 'Idle_In', loop: 'once', crossFade: 0.3 },
    ],
  },
  {
    id: 'flex',
    weight: 1.0,
    requiredAnims: ['Idle_In', 'Cast_Animation', 'Finisher01', 'Recall', 'Idle_Base'],
    steps: [
      { name: 'Idle_In', loop: 'once', crossFade: 0.2 },
      { name: 'Cast_Animation', loop: 'once', crossFade: 0.25 },
      { name: 'Finisher01', loop: 'once', crossFade: 0.25 },
      { name: 'Recall', loop: 'once', crossFade: 0.3 },
      { name: 'Idle_Base', loop: 'once', crossFade: 0.3 },
    ],
  },
  {
    id: 'pouty',
    weight: 1.0,
    requiredAnims: ['Damage_Hurt', 'Joke_In', 'Joke_Loop', 'Idle_In'],
    steps: [
      { name: 'Damage_Hurt', loop: 'once', crossFade: 0.2 },
      { name: 'Joke_In', loop: 'once', crossFade: 0.25 },
      { name: 'Joke_Loop', loop: 'loop', loopDuration: 1.8, crossFade: 0.25 },
      { name: 'Idle_In', loop: 'once', crossFade: 0.3 },
    ],
  },
  {
    id: 'rampage',
    weight: 0.8,
    requiredAnims: ['Run_Base', 'Taunt_In', 'Finisher02', 'Run_Haste', 'Idle_In'],
    steps: [
      { name: 'Run_Base', loop: 'loop', loopDuration: 1.0, crossFade: 0.2 },
      { name: 'Taunt_In', loop: 'once', crossFade: 0.25 },
      { name: 'Finisher02', loop: 'once', crossFade: 0.25 },
      { name: 'Run_Haste', loop: 'loop', loopDuration: 1.0, crossFade: 0.25 },
      { name: 'Idle_In', loop: 'once', crossFade: 0.3 },
    ],
  },
  {
    id: 'party',
    weight: 0.6,
    requiredAnims: ['Dance_In', 'Dance01_Loop', 'Dance02_Loop', 'Recall_Winddown'],
    steps: [
      { name: 'Dance_In', loop: 'once', crossFade: 0.2 },
      { name: 'Dance01_Loop', loop: 'loop', loopDuration: 2.0, crossFade: 0.25 },
      { name: 'Dance02_Loop', loop: 'loop', loopDuration: 2.0, crossFade: 0.25 },
      { name: 'Recall_Winddown', loop: 'once', crossFade: 0.3 },
    ],
  },
];

/** 单一动作池子 + 权重（用于随机调度） */
export interface SingleActionPool {
  category: string;
  weight: number;
  anims: ReadonlyArray<string>;
}

export const SINGLE_ACTION_POOLS: ReadonlyArray<SingleActionPool> = [
  { category: 'idle', weight: 6, anims: ['Idle_In', 'Idle_Base'] },
  {
    category: 'social',
    weight: 4,
    anims: [
      'Greeting',
      'Laugh',
      'Joke',
      'Joke_In',
      'JokeA_In',
      'JokeB_In',
      'JokeC_In',
      'Taunt',
      'Taunt_In',
      'Doll_IdleIn', // Gwen 专属：变玩偶；其他角色没有，has() 检查会过滤
    ],
  },
  { category: 'combat', weight: 2, anims: ['Cast_Animation', 'Dive_In', 'Dive_Out', 'Recall'] },
  {
    category: 'finisher',
    weight: 1,
    anims: ['Finisher01', 'Finisher02', 'Finisher03', 'Finisher04', 'Finisher05', 'Finisher06'],
  },
];

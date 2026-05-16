// 动作命名规范与类型定义。基于 inspect-glb 扫描结果总结。

export type BaseAnimName =
  | 'Idle_Base'
  | 'Idle_In'
  | 'Damage_Hurt'
  | 'Run_Base'
  | 'Run_Haste'
  | 'Cast_Animation'
  | 'Cast_Cycle'
  | 'Cast_Damage'
  | 'Dive_In'
  | 'Dive_Out'
  | 'Death'
  | 'Interact'
  | 'Recall'
  | 'Recall_Winddown'
  | 'Dance_In'
  | 'Dance_Loop'
  | 'Dance01_Loop'
  | 'Dance02_Loop'
  | 'Laugh'
  | 'Greeting'
  | 'Joke'
  | 'Joke_In'
  | 'Joke_Loop'
  | 'JokeA_In'
  | 'JokeA_Loop'
  | 'JokeB_In'
  | 'JokeB_Loop'
  | 'JokeC_In'
  | 'JokeC_Loop'
  | 'Taunt'
  | 'Taunt_In'
  | 'Taunt_loop'
  | 'Doll_IdleIn';

export type FinisherName = `Finisher0${1 | 2 | 3 | 4 | 5 | 6}`;
export type AnimationName = BaseAnimName | FinisherName | string;

/** 优先用于待机的动画 */
export const IDLE_ANIMS: readonly BaseAnimName[] = ['Idle_Base', 'Idle_In'] as const;

/** 社交向动画（适合点击触发） */
export const SOCIAL_ANIMS: readonly BaseAnimName[] = [
  'Greeting',
  'Laugh',
  'Joke',
  'Joke_In',
  'JokeA_In',
  'JokeB_In',
  'JokeC_In',
  'Taunt',
  'Taunt_In',
  'Doll_IdleIn',
] as const;

/** 拖拽时优先动画——只用跑动，不用 Dive_In（飞扑/跳跃，跟"拖着走"的体感不符） */
export const DRAG_ANIMS: readonly BaseAnimName[] = ['Run_Base', 'Run_Haste'] as const;

/** 落地（拖拽结束）后回归动画 */
export const SETTLE_ANIMS: readonly BaseAnimName[] = ['Idle_In', 'Idle_Base'] as const;

/** 检测某个动画名是否为 Finisher */
export const isFinisher = (name: string): boolean => /^Finisher0[1-6]$/i.test(name);

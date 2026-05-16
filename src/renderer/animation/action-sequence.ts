// 拼接动作类型

export type StepLoopMode = 'once' | 'loop';

export interface ActionStep {
  name: string;
  loop?: StepLoopMode;
  /** loop 模式下的总时长（秒），到时自动进入下一段 */
  loopDuration?: number;
  /** 进入该段时的 crossFade（秒） */
  crossFade?: number;
}

export interface ActionSequence {
  id: string;
  steps: ReadonlyArray<ActionStep>;
  /** 当前角色缺少其中任意一个动画则跳过该序列 */
  requiredAnims: ReadonlyArray<string>;
  /** 随机调度时的权重 */
  weight: number;
}

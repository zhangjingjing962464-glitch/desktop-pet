import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { pickLongestAction } from '../../../src/renderer/animation/longest-action.js';

function mkClip(name: string, duration: number): THREE.AnimationClip {
  return new THREE.AnimationClip(name, duration, []);
}

describe('pickLongestAction', () => {
  it('returns null for empty map', () => {
    const m = new Map<string, THREE.AnimationClip>();
    expect(pickLongestAction(m)).toBeNull();
  });

  it('picks longest Finisher when finishers exist', () => {
    const clips = new Map([
      ['Idle_Base', mkClip('Idle_Base', 5)],
      ['Finisher01', mkClip('Finisher01', 3)],
      ['Finisher02', mkClip('Finisher02', 7)],
      ['Finisher03', mkClip('Finisher03', 4)],
    ]);
    const result = pickLongestAction(clips);
    expect(result?.name).toBe('Finisher02');
  });

  it('falls back to overall longest when no Finisher', () => {
    const clips = new Map([
      ['Idle_Base', mkClip('Idle_Base', 1.5)],
      ['Dance_Loop', mkClip('Dance_Loop', 2.5)],
      ['Cast_Animation', mkClip('Cast_Animation', 4.0)],
    ]);
    const result = pickLongestAction(clips);
    expect(result?.name).toBe('Cast_Animation');
  });

  it('is case-insensitive for Finisher detection', () => {
    const clips = new Map([
      ['Idle_Base', mkClip('Idle_Base', 5)],
      ['finisher03', mkClip('finisher03', 3)],
    ]);
    const result = pickLongestAction(clips);
    expect(result?.name).toBe('finisher03');
  });
});

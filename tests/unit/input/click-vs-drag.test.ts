import { describe, it, expect } from 'vitest';
import { isStillClick, exceededDragThreshold } from '../../../src/renderer/input/click-vs-drag.js';

describe('click-vs-drag', () => {
  const start = { startX: 100, startY: 200, startT: 1000 };

  it('within thresholds → click', () => {
    expect(isStillClick(start, { x: 101, y: 201, t: 1100 })).toBe(true);
    expect(exceededDragThreshold(start, { x: 101, y: 201, t: 1100 })).toBe(false);
  });

  it('displacement exceeds → drag', () => {
    expect(isStillClick(start, { x: 110, y: 210, t: 1100 })).toBe(false);
    expect(exceededDragThreshold(start, { x: 110, y: 210, t: 1100 })).toBe(true);
  });

  it('time exceeds → drag', () => {
    expect(isStillClick(start, { x: 100, y: 200, t: 1300 })).toBe(false);
    expect(exceededDragThreshold(start, { x: 100, y: 200, t: 1300 })).toBe(true);
  });

  it('exact threshold boundary: 4px → not click (strict <4)', () => {
    expect(isStillClick(start, { x: 104, y: 200, t: 1100 })).toBe(false);
  });

  it('diagonal displacement', () => {
    // sqrt(3^2 + 3^2) = 4.24 > 4
    expect(isStillClick(start, { x: 103, y: 203, t: 1100 })).toBe(false);
  });
});

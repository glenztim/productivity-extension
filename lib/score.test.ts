import { describe, expect, it } from 'vitest';
import { dayProgress, distractionShare, progressLevel } from './score';
import type { DayStats } from './storage';

const GOAL = 4 * 3600;
const day = (good: number, neutral = 0, bad = 0): DayStats => ({
  goodSeconds: good,
  neutralSeconds: neutral,
  badSeconds: bad,
});

describe('dayProgress', () => {
  it('is good time divided by the goal', () => {
    expect(dayProgress(day(GOAL / 2), GOAL)).toBe(0.5);
  });

  it('can exceed 1', () => {
    expect(dayProgress(day(GOAL * 2), GOAL)).toBe(2);
  });

  it('is unaffected by bad and neutral time', () => {
    expect(dayProgress(day(GOAL / 2, 9999, 99999), GOAL)).toBe(0.5);
  });

  it('is 0, not null, when time was tracked but none of it was good', () => {
    expect(dayProgress(day(0, 0, 600), GOAL)).toBe(0);
  });

  it('is null with no data', () => {
    expect(dayProgress(undefined, GOAL)).toBeNull();
    expect(dayProgress(day(0), GOAL)).toBeNull();
  });
});

describe('progressLevel', () => {
  it('is none without data', () => {
    expect(progressLevel(null)).toBe('none');
  });

  it.each([
    [0, 'started'],
    [0.2499, 'started'],
    [0.25, 'building'],
    [0.5999, 'building'],
    [0.6, 'strong'],
    [0.9999, 'strong'],
    [1, 'reached'],
    [1.5, 'reached'],
    [1.5001, 'beyond'],
    [3, 'beyond'],
  ])('maps progress %s to %s', (progress, level) => {
    expect(progressLevel(progress)).toBe(level);
  });
});

describe('distractionShare', () => {
  it('is bad over all tracked time', () => {
    expect(distractionShare(day(600, 300, 100))).toBeCloseTo(0.1);
  });

  it('is 0 with no bad time and 1 with only bad time', () => {
    expect(distractionShare(day(600, 300))).toBe(0);
    expect(distractionShare(day(0, 0, 60))).toBe(1);
  });

  it('is null with no tracked time', () => {
    expect(distractionShare(undefined)).toBeNull();
    expect(distractionShare(day(0))).toBeNull();
  });
});

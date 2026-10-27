import type { DayStats } from './storage';

/** Lower bound (inclusive) of each progress level, as a fraction of the daily good-time goal. */
export const LEVEL_BUILDING_FROM = 0.25;
export const LEVEL_STRONG_FROM = 0.6;
export const LEVEL_REACHED_FROM = 1;
/** Progress strictly above this counts as "beyond"; exactly this still counts as "reached". */
export const LEVEL_BEYOND_ABOVE = 1.5;

export type ProgressLevel = 'none' | 'started' | 'building' | 'strong' | 'reached' | 'beyond';

export const PROGRESS_LABELS: Record<Exclude<ProgressLevel, 'none'>, string> = {
  started: 'Getting started',
  building: 'Building momentum',
  strong: 'In the flow',
  reached: 'Goal reached',
  beyond: 'Beyond the goal',
};

function trackedSeconds(d: DayStats): number {
  return d.goodSeconds + d.neutralSeconds + d.badSeconds;
}

/**
 * Good time relative to the daily goal: 0 or more, may exceed 1. Bad time never reduces it.
 * Null means no tracked time that day.
 */
export function dayProgress(d: DayStats | undefined, goalSeconds: number): number | null {
  if (!d || trackedSeconds(d) === 0 || goalSeconds <= 0) return null;
  return d.goodSeconds / goalSeconds;
}

export function progressLevel(progress: number | null): ProgressLevel {
  if (progress === null) return 'none';
  if (progress > LEVEL_BEYOND_ABOVE) return 'beyond';
  if (progress >= LEVEL_REACHED_FROM) return 'reached';
  if (progress >= LEVEL_STRONG_FROM) return 'strong';
  if (progress >= LEVEL_BUILDING_FROM) return 'building';
  return 'started';
}

/** Bad time as a share of all tracked time, in [0, 1]. Null means no tracked time that day. */
export function distractionShare(d: DayStats | undefined): number | null {
  if (!d) return null;
  const total = trackedSeconds(d);
  return total === 0 ? null : d.badSeconds / total;
}

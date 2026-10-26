import type { DayStats } from './storage';

/** Net good-minus-bad time relative to all tracked time, in [-1, 1]. Null means no data that day. */
export function computeDayScore(d: DayStats | undefined): number | null {
  if (!d) return null;
  const total = d.goodSeconds + d.badSeconds + d.neutralSeconds;
  if (total === 0) return null;
  return (d.goodSeconds - d.badSeconds) / total;
}

export type ScoreBucket = 'excellent' | 'good' | 'neutral' | 'poor' | 'bad' | 'none';

export function bucketScore(score: number | null): ScoreBucket {
  if (score === null) return 'none';
  if (score >= 0.5) return 'excellent';
  if (score >= 0.15) return 'good';
  if (score > -0.15) return 'neutral';
  if (score > -0.5) return 'poor';
  return 'bad';
}

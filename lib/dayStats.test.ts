import { describe, expect, it } from 'vitest';
import { getDayEvents, getDayHours, getDayTotals, type StatsSource } from './dayStats';
import { dayProgress } from './score';

const src = (partial: Partial<StatsSource>): StatsSource => ({ hourly: {}, legacy: {}, events: {}, ...partial });

describe('legacy fallback', () => {
  const legacyOnly = src({ legacy: { '2025-01-01': { goodSeconds: 3600, badSeconds: 600, neutralSeconds: 0 } } });

  it('uses legacy totals and reports no hourly detail for days without hourly data', () => {
    expect(getDayTotals(legacyOnly, '2025-01-01')).toEqual({ goodSeconds: 3600, badSeconds: 600, neutralSeconds: 0 });
    expect(getDayHours(legacyOnly, '2025-01-01')).toBeNull();
  });

  it('treats an empty hourly record as no hourly data', () => {
    const s = src({ ...legacyOnly, hourly: { '2025-01-01': {} } });
    expect(getDayHours(s, '2025-01-01')).toBeNull();
    expect(getDayTotals(s, '2025-01-01')?.goodSeconds).toBe(3600);
  });

  it('returns undefined when neither source has the day', () => {
    expect(getDayTotals(legacyOnly, '2025-01-02')).toBeUndefined();
    expect(dayProgress(getDayTotals(legacyOnly, '2025-01-02'), 3600)).toBeNull();
  });
});

describe('hourly data', () => {
  const s = src({
    legacy: { '2025-01-01': { goodSeconds: 99999, badSeconds: 0, neutralSeconds: 0 } },
    hourly: {
      '2025-01-01': {
        9: { goodSeconds: 1800, badSeconds: 0, neutralSeconds: 600 },
        21: { goodSeconds: 0, badSeconds: 900, neutralSeconds: 0 },
      },
    },
  });

  it('is authoritative over legacy totals and sums across hours', () => {
    expect(getDayTotals(s, '2025-01-01')).toEqual({ goodSeconds: 1800, badSeconds: 900, neutralSeconds: 600 });
  });

  it('returns 24 buckets with zeros for untouched hours', () => {
    const hours = getDayHours(s, '2025-01-01')!;
    expect(hours).toHaveLength(24);
    expect(hours[9]?.goodSeconds).toBe(1800);
    expect(hours[3]).toEqual({ goodSeconds: 0, badSeconds: 0, neutralSeconds: 0 });
  });

  it('feeds dayProgress through the summed totals', () => {
    expect(dayProgress(getDayTotals(s, '2025-01-01'), 3600)).toBeCloseTo(0.5);
  });
});

describe('getDayEvents', () => {
  const zeros = { goalReached: 0, sessionsCompleted: 0, unlocksUsed: 0, tabsAutoClosed: 0, checklistDone: 0, xpEarned: 0 };
  const s = src({ events: { '2025-01-01': { goalReached: 1, xpEarned: 40 } } });

  it('returns zeros for a day with no record', () => {
    expect(getDayEvents(s, '2025-01-02')).toEqual(zeros);
    expect(getDayEvents(src({}), '2025-01-01')).toEqual(zeros);
  });

  it('fills counters that were never recorded with 0', () => {
    expect(getDayEvents(s, '2025-01-01')).toEqual({ ...zeros, goalReached: 1, xpEarned: 40 });
  });
});

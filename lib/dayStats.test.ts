import { describe, expect, it } from 'vitest';
import { getDayHours, getDayTotals, type StatsSource } from './dayStats';
import { computeDayScore } from './score';

const src = (partial: Partial<StatsSource>): StatsSource => ({ hourly: {}, legacy: {}, ...partial });

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
    expect(computeDayScore(getDayTotals(legacyOnly, '2025-01-02'))).toBeNull();
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

  it('feeds computeDayScore through the summed totals', () => {
    expect(computeDayScore(getDayTotals(s, '2025-01-01'))).toBeCloseTo((1800 - 900) / 3300);
  });
});

import { describe, expect, it } from 'vitest';
import { generateMockStats } from './mockData';
import { getDayEvents, getDayTotals } from './dayStats';
import { DEFAULT_DAILY_TARGET_MINUTES } from './storage';
import { lastNDays, localDateKey } from './dateUtils';

const end = new Date(2025, 5, 20, 15).getTime();

describe('mock events', () => {
  const stats = generateMockStats(5, end);

  it('only covers days that have mock totals, over the last two weeks', () => {
    const keys = Object.keys(stats.events);
    expect(keys.length).toBeGreaterThan(5);
    const recent = new Set(lastNDays(14, end).map((d) => localDateKey(d.getTime())));
    for (const k of keys) {
      expect(recent.has(k)).toBe(true);
      expect(stats.legacy[k]).toBeDefined();
    }
  });

  it('sets goalReached exactly for days whose good time reached the default goal', () => {
    for (const k of Object.keys(stats.events)) {
      const reached = (getDayTotals(stats, k)?.goodSeconds ?? 0) >= DEFAULT_DAILY_TARGET_MINUTES * 60;
      expect(getDayEvents(stats, k).goalReached).toBe(reached ? 1 : 0);
    }
    expect(Object.values(stats.events).some((e) => e.goalReached === 1)).toBe(true);
  });

  it('is deterministic and leaves older days without events', () => {
    expect(generateMockStats(5, end).events).toEqual(stats.events);
    expect(getDayEvents(stats, '2020-01-01').xpEarned).toBe(0);
  });
});

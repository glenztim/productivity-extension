import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { shiftDateKey, splitByLocalHour } from './dateUtils';

describe('shiftDateKey', () => {
  it('moves across month, year and DST boundaries', () => {
    process.env.TZ = 'America/New_York';
    expect(shiftDateKey('2025-03-01', -1)).toBe('2025-02-28');
    expect(shiftDateKey('2025-12-31', 1)).toBe('2026-01-01');
    expect(shiftDateKey('2025-03-08', 1)).toBe('2025-03-09');
    expect(shiftDateKey('2025-03-09', 1)).toBe('2025-03-10');
    expect(shiftDateKey('2025-11-02', -1)).toBe('2025-11-01');
    expect(shiftDateKey('2025-11-02', 1)).toBe('2025-11-03');
  });
});

const utc = (iso: string) => Date.parse(iso);
const total = (segs: Array<{ seconds: number }>) => segs.reduce((s, x) => s + x.seconds, 0);

describe('splitByLocalHour', () => {
  const originalTZ = process.env.TZ;
  afterAll(() => {
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
  });

  describe('America/New_York', () => {
    beforeAll(() => {
      process.env.TZ = 'America/New_York';
    });

    it('returns nothing for an empty interval', () => {
      expect(splitByLocalHour(utc('2025-06-10T14:00:00Z'), utc('2025-06-10T14:00:00Z'))).toEqual([]);
    });

    it('keeps an interval inside one hour in one slot', () => {
      // 10:10-10:40 EDT
      const segs = splitByLocalHour(utc('2025-06-10T14:10:00Z'), utc('2025-06-10T14:40:00Z'));
      expect(segs).toEqual([{ dateKey: '2025-06-10', hour: 10, seconds: 1800 }]);
    });

    it('splits across hour boundaries', () => {
      // 10:30-12:15 EDT
      const segs = splitByLocalHour(utc('2025-06-10T14:30:00Z'), utc('2025-06-10T16:15:00Z'));
      expect(segs).toEqual([
        { dateKey: '2025-06-10', hour: 10, seconds: 1800 },
        { dateKey: '2025-06-10', hour: 11, seconds: 3600 },
        { dateKey: '2025-06-10', hour: 12, seconds: 900 },
      ]);
    });

    it('credits each side of local midnight to its own day', () => {
      // 23:30 EDT -> 00:30 EDT next day
      const segs = splitByLocalHour(utc('2025-06-11T03:30:00Z'), utc('2025-06-11T04:30:00Z'));
      expect(segs).toEqual([
        { dateKey: '2025-06-10', hour: 23, seconds: 1800 },
        { dateKey: '2025-06-11', hour: 0, seconds: 1800 },
      ]);
    });

    it('has no 2 AM slot on a spring-forward day', () => {
      // 01:30 EST -> 03:30 EDT on 2025-03-09 is one real hour
      const segs = splitByLocalHour(utc('2025-03-09T06:30:00Z'), utc('2025-03-09T07:30:00Z'));
      expect(segs).toEqual([
        { dateKey: '2025-03-09', hour: 1, seconds: 1800 },
        { dateKey: '2025-03-09', hour: 3, seconds: 1800 },
      ]);
    });

    it('sums the repeated hour into one slot on a fall-back day', () => {
      // 01:30 EDT -> 02:30 EST on 2025-11-02 is two real hours; 1 AM happens twice
      const segs = splitByLocalHour(utc('2025-11-02T05:30:00Z'), utc('2025-11-02T07:30:00Z'));
      expect(segs).toEqual([
        { dateKey: '2025-11-02', hour: 1, seconds: 1800 + 3600 },
        { dateKey: '2025-11-02', hour: 2, seconds: 1800 },
      ]);
    });

    it('conserves total time over a full fall-back day (25 real hours)', () => {
      const from = utc('2025-11-02T04:00:00Z'); // 00:00 EDT
      const to = utc('2025-11-03T05:00:00Z'); // 00:00 EST next day
      const segs = splitByLocalHour(from, to);
      expect(total(segs)).toBe(25 * 3600);
      expect(segs.filter((s) => s.dateKey === '2025-11-02')).toHaveLength(24);
      expect(segs.find((s) => s.hour === 1)?.seconds).toBe(7200);
    });
  });

  describe('Asia/Kolkata (+05:30)', () => {
    beforeAll(() => {
      process.env.TZ = 'Asia/Kolkata';
    });

    it('aligns slots to local hour boundaries, not UTC ones', () => {
      // 10:15-11:15 IST
      const segs = splitByLocalHour(utc('2025-06-10T04:45:00Z'), utc('2025-06-10T05:45:00Z'));
      expect(segs).toEqual([
        { dateKey: '2025-06-10', hour: 10, seconds: 2700 },
        { dateKey: '2025-06-10', hour: 11, seconds: 900 },
      ]);
    });
  });
});

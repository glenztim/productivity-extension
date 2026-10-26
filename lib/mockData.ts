import { localDateKey } from './dateUtils';
import type { StatsSource } from './dayStats';
import type { DailyStatsMap, DayStats, HourlyStatsMap } from './storage';

/** Flip to `true` to make the dashboard and popup show generated sample data instead of real stats. */
export const USE_MOCK_DATA = true;

/** Small deterministic PRNG (mulberry32) so the mock data looks the same on every reload. */
function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HOUR = 3600;

/**
 * Generates `weeks` weeks of plausible daily stats ending today: productive weekdays, lighter
 * weekends, a few off days with no tracked time, and a slow upward trend in good time.
 */
export function generateMockDailyStats(weeks = 5, endTimestamp = Date.now()): DailyStatsMap {
  const rand = seededRandom(42);
  const between = (min: number, max: number) => min + rand() * (max - min);
  const totalDays = weeks * 7;
  const map: DailyStatsMap = {};

  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(endTimestamp);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - i);

    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const progress = 1 - i / totalDays; // 0 (oldest) → 1 (today)
    const isOffDay = !isWeekend && rand() < 0.07;
    if (isOffDay && i !== 0) continue;

    const goodHours = isWeekend ? between(0.3, 2) : between(2, 4.5) + progress * 1.2;
    const badHours = isWeekend ? between(1, 3) : between(0.4, 2.2) * (1.15 - progress * 0.4);
    const neutralHours = between(0.5, 1.8);

    map[localDateKey(d.getTime())] = {
      goodSeconds: Math.round(goodHours * HOUR),
      badSeconds: Math.round(badHours * HOUR),
      neutralSeconds: Math.round(neutralHours * HOUR),
    };
  }
  return map;
}

/** Days (counting back from today) that get hourly mock data; older days stay legacy-only to exercise the fallback. */
const MOCK_HOURLY_DAYS = 14;

/** Spreads `seconds` over `hours` (clipped to 0..lastHour) with random weights; falls back to every allowed hour. */
function spread(seconds: number, hours: number[], lastHour: number, rand: () => number): number[] {
  const out = new Array<number>(24).fill(0);
  let slots = hours.filter((h) => h <= lastHour);
  if (slots.length === 0) slots = Array.from({ length: lastHour + 1 }, (_, h) => h);
  const weights = slots.map(() => 0.5 + rand());
  const sum = weights.reduce((a, b) => a + b, 0);
  slots.forEach((h, i) => (out[h] = (seconds * (weights[i] ?? 0)) / sum));
  return out;
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** Daily mock totals plus plausible hour-by-hour detail for the most recent days (today only up to the current hour). */
export function generateMockStats(weeks = 5, endTimestamp = Date.now()): StatsSource {
  const legacy = generateMockDailyStats(weeks, endTimestamp);
  const rand = seededRandom(7);
  const hourly: HourlyStatsMap = {};

  for (let i = 0; i < MOCK_HOURLY_DAYS; i++) {
    const d = new Date(endTimestamp);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = localDateKey(d.getTime());
    const totals = legacy[key];
    if (!totals) continue;

    const weekend = d.getDay() === 0 || d.getDay() === 6;
    const lastHour = i === 0 ? new Date(endTimestamp).getHours() : 23;
    const good = spread(totals.goodSeconds, weekend ? range(10, 16) : [...range(9, 12), ...range(14, 17)], lastHour, rand);
    const bad = spread(totals.badSeconds, weekend ? range(11, 23) : [12, 13, ...range(19, 23)], lastHour, rand);
    const neutral = spread(totals.neutralSeconds, range(8, 22), lastHour, rand);

    const day: Record<number, DayStats> = {};
    for (let h = 0; h < 24; h++) {
      const [g, b, n] = [good[h] ?? 0, bad[h] ?? 0, neutral[h] ?? 0];
      const total = g + b + n;
      if (total === 0) continue;
      const scale = total > HOUR ? HOUR / total : 1; // an hour can't hold more than 3600s
      day[h] = { goodSeconds: g * scale, badSeconds: b * scale, neutralSeconds: n * scale };
    }
    hourly[key] = day;
  }
  return { hourly, legacy };
}

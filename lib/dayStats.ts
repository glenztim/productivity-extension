import { DAY_EVENT_NAMES, type DailyStatsMap, type DayEventName, type DayEventsMap, type DayStats, type HourlyStatsMap } from './storage';

/** Everything the UI needs to read tracked time: hourly data is authoritative, legacy day totals are the fallback. */
export interface StatsSource {
  hourly: HourlyStatsMap;
  legacy: DailyStatsMap;
  events: DayEventsMap;
}

const emptyHour = (): DayStats => ({ goodSeconds: 0, badSeconds: 0, neutralSeconds: 0 });

/** The 24 hourly buckets for a day (index = hour), or null when the day only has legacy totals or nothing. */
export function getDayHours(src: StatsSource, dateKey: string): DayStats[] | null {
  const day = src.hourly[dateKey];
  if (!day || Object.keys(day).length === 0) return null;
  return Array.from({ length: 24 }, (_, h) => day[h] ?? emptyHour());
}

/** Category totals for a day: summed from hourly data when present, else the legacy daily record. */
export function getDayTotals(src: StatsSource, dateKey: string): DayStats | undefined {
  const hours = getDayHours(src, dateKey);
  if (!hours) return src.legacy[dateKey];
  return hours.reduce<DayStats>(
    (sum, h) => ({
      goodSeconds: sum.goodSeconds + h.goodSeconds,
      badSeconds: sum.badSeconds + h.badSeconds,
      neutralSeconds: sum.neutralSeconds + h.neutralSeconds,
    }),
    emptyHour(),
  );
}

/** Every counter for a day, with 0 for anything not recorded (including days with no record at all). */
export function getDayEvents(src: StatsSource, dateKey: string): Record<DayEventName, number> {
  const day = src.events[dateKey];
  const out = {} as Record<DayEventName, number>;
  for (const name of DAY_EVENT_NAMES) out[name] = day?.[name] ?? 0;
  return out;
}

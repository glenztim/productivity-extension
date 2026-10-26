export interface SiteEntry {
  id: string;
  pattern: string;
  label?: string;
  addedAt: number;
}

export const blocklist = storage.defineItem<SiteEntry[]>('local:blocklist', {
  fallback: [],
});

export const productivityList = storage.defineItem<SiteEntry[]>('local:productivityList', {
  fallback: [],
});

export type RatioMode = 'strict' | 'balanced' | 'generous' | 'custom';

export interface Settings {
  ratioMode: RatioMode;
  customRatio: { goodMinutes: number; poolMinutes: number };
  shortSessionMinutes: number;
  longSessionMinutesDefault: number;
  hardBlockMinutesDefault: number;
  /** Absent on installs that predate the Day view; read via `?? DEFAULT_DAILY_TARGET_MINUTES`. */
  dailyGoodTargetMinutes?: number;
}

export const DEFAULT_DAILY_TARGET_MINUTES = 240;

export const settings = storage.defineItem<Settings>('local:settings', {
  fallback: {
    ratioMode: 'balanced',
    customRatio: { goodMinutes: 5, poolMinutes: 1 },
    shortSessionMinutes: 120,
    longSessionMinutesDefault: 240,
    hardBlockMinutesDefault: 60,
    dailyGoodTargetMinutes: DEFAULT_DAILY_TARGET_MINUTES,
  },
});

export const poolBalanceSeconds = storage.defineItem<number>('local:poolBalanceSeconds', {
  fallback: 0,
});

export type Mode =
  | { type: 'free' }
  | { type: 'session'; kind: 'short' | 'long'; startedAt: number; endsAt: number }
  | { type: 'hardBlock'; startedAt: number; endsAt: number };

export const activeMode = storage.defineItem<Mode>('local:activeMode', {
  fallback: { type: 'free' },
});

export type Category = 'good' | 'bad' | 'neutral' | 'none';

export interface Checkpoint {
  timestamp: number;
  category: Category;
  tabId: number | null;
  hostname: string | null;
}

export const checkpoint = storage.defineItem<Checkpoint>('local:checkpoint', {
  fallback: { timestamp: Date.now(), category: 'none', tabId: null, hostname: null },
});

export interface DayStats {
  goodSeconds: number;
  badSeconds: number;
  neutralSeconds: number;
}

export type DailyStatsMap = Record<string, DayStats>;

/** Legacy per-day totals. No longer written; read only as a fallback for days with no hourly data. */
export const dailyStats = storage.defineItem<DailyStatsMap>('local:dailyStats', {
  fallback: {},
});

/**
 * Source of truth for tracked time: 'YYYY-MM-DD' (local) -> hour of day (0-23) -> category totals.
 * Category totals only; hostnames and URLs are never stored. Per-day counters added later (unlocks
 * used, tabs auto-closed, ...) belong in a sibling item keyed by the same date, not in here.
 */
export type HourlyStatsMap = Record<string, Record<number, DayStats>>;

export const hourlyStats = storage.defineItem<HourlyStatsMap>('local:hourlyStats', {
  fallback: {},
});

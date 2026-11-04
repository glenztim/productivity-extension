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
}

export const checkpoint = storage.defineItem<Checkpoint>('local:checkpoint', {
  fallback: { timestamp: Date.now(), category: 'none', tabId: null },
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

/** Names of the per-day counters. Add a name here (and to DAY_EVENT_NAMES) to introduce a counter. */
export const DAY_EVENT_NAMES = [
  'goalReached',
  'sessionsCompleted',
  'unlocksUsed',
  'tabsAutoClosed',
  'checklistDone',
  'xpEarned',
] as const;

export type DayEventName = (typeof DAY_EVENT_NAMES)[number];

/** Numbers only, so nothing identifying can end up here. A missing counter means 0. */
export type DayEvents = Partial<Record<DayEventName, number>>;

/**
 * Per-day event counters: 'YYYY-MM-DD' (local) -> counters. One map, like hourlyStats. Every counter
 * is optional, so new counters can be added to DayEventName without a migration: old days simply
 * read as 0 for them. Written only by the background via lib/dayEvents.
 */
export type DayEventsMap = Record<string, DayEvents>;

export const dayEvents = storage.defineItem<DayEventsMap>('local:dayEvents', {
  fallback: {},
});

export interface TabLimitEntry {
  id: string;
  pattern: string;
  maxTabs: number;
}

export const tabLimits = storage.defineItem<TabLimitEntry[]>('local:tabLimits', {
  fallback: [],
});

/** Epoch ms until which tab limits are not enforced; set at browser start so a restored session is left alone. */
export const tabLimitGraceUntil = storage.defineItem<number>('local:tabLimitGraceUntil', {
  fallback: 0,
});

export const userName = storage.defineItem<string>('local:userName', {
  fallback: '',
});

/**
 * tabId (as a string key) -> id of the tab limit that tab currently counts toward. Ids only, never
 * hostnames. Session storage survives the background being suspended and restarted, but is cleared
 * when the browser restarts (tab ids are not stable across that anyway).
 */
export const tabLimitCounted = storage.defineItem<Record<string, string>>('session:tabLimitCounted', {
  fallback: {},
});

/**
 * Set (in session storage) once this browser session has been seen by the background. Session
 * storage is empty exactly when the browser, or the extension, has just started, so a missing
 * marker means "a start happened" without relying on the onStartup event or its ordering.
 */
export const tabLimitSessionStarted = storage.defineItem<boolean>('session:tabLimitSessionStarted', {
  fallback: false,
});

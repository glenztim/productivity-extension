/** Local (not UTC) YYYY-MM-DD for a timestamp, so day boundaries match the user's wall clock. */
export function localDateKey(timestamp: number): string {
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Local noon of a 'YYYY-MM-DD' key (noon so formatting never lands on the wrong day around DST). */
export function parseDateKey(dateKey: string): Date {
  const [y = 0, m = 1, d = 1] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

/** Moves a 'YYYY-MM-DD' key by whole local days (negative = back). Anchored at noon so DST never skips or repeats a date. */
export function shiftDateKey(dateKey: string, days: number): string {
  const d = parseDateKey(dateKey);
  d.setDate(d.getDate() + days);
  return localDateKey(d.getTime());
}

function startOfNextLocalDay(timestamp: number): number {
  const d = new Date(timestamp);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

/**
 * Splits the [from, to) interval into per-local-day segments, so time spent
 * browsing across midnight is credited to the correct day on each side.
 */
export function splitByLocalDay(from: number, to: number): Array<{ dateKey: string; seconds: number }> {
  const segments: Array<{ dateKey: string; seconds: number }> = [];
  let cursor = from;
  while (cursor < to) {
    const nextBoundary = Math.min(startOfNextLocalDay(cursor), to);
    segments.push({ dateKey: localDateKey(cursor), seconds: (nextBoundary - cursor) / 1000 });
    cursor = nextBoundary;
  }
  return segments;
}

/**
 * Splits the [from, to) interval into per-local-hour segments (hour is the wall-clock 0-23 slot).
 * Slots are keyed by wall-clock time, so on a DST fall-back day the repeated hour is one slot
 * holding both passes; a spring-forward day simply has no 2 AM slot.
 */
export function splitByLocalHour(from: number, to: number): Array<{ dateKey: string; hour: number; seconds: number }> {
  const slots = new Map<string, { dateKey: string; hour: number; seconds: number }>();
  let cursor = from;
  while (cursor < to) {
    const d = new Date(cursor);
    // Distance to the next local hour boundary; deriving it from local minutes keeps half-hour zones right.
    const intoHourMs = ((d.getMinutes() * 60 + d.getSeconds()) * 1000) + d.getMilliseconds();
    const nextBoundary = Math.min(cursor - intoHourMs + 3_600_000, to);
    const dateKey = localDateKey(cursor);
    const hour = d.getHours();
    const id = `${dateKey}#${hour}`;
    const slot = slots.get(id) ?? { dateKey, hour, seconds: 0 };
    slot.seconds += (nextBoundary - cursor) / 1000;
    slots.set(id, slot);
    cursor = nextBoundary;
  }
  return [...slots.values()];
}

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The last `n` local days (oldest first, today last). */
export function lastNDays(n: number, endTimestamp = Date.now()): Date[] {
  const days: Date[] = [];
  const end = new Date(endTimestamp);
  end.setHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  return days;
}

export interface MonthCell {
  date: Date;
  dateKey: string;
  inMonth: boolean;
}

/** A 6x7 grid of days covering the given month, padded with adjacent-month days to fill full weeks. */
export function getMonthMatrix(year: number, month: number): MonthCell[] {
  const firstOfMonth = new Date(year, month, 1);
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(gridStart.getDate() - firstOfMonth.getDay());

  const cells: MonthCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    cells.push({ date: d, dateKey: localDateKey(d.getTime()), inMonth: d.getMonth() === month });
  }
  return cells;
}

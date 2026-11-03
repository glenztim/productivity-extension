import { DAY_EVENT_NAMES, dayEvents, type DayEventName } from './storage';
import { serialize } from './mutex';

/** Counters that only say "it happened today": recording them again keeps the value at 1. */
const FLAG_EVENTS: ReadonlySet<DayEventName> = new Set(['goalReached']);

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function isDayEventName(name: string): name is DayEventName {
  return (DAY_EVENT_NAMES as readonly string[]).includes(name);
}

/** Caller must hold the accounting lock (`serialize`). */
export async function recordEventLocked(dateKey: string, name: DayEventName, amount = 1): Promise<void> {
  if (!DATE_KEY.test(dateKey)) throw new Error(`recordEvent: invalid date key "${dateKey}"`);
  if (!isDayEventName(name)) throw new Error(`recordEvent: unknown event "${String(name)}"`);
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    throw new Error(`recordEvent: amount must be a positive finite number, got ${String(amount)}`);
  }

  const map = await dayEvents.getValue();
  const day = map[dateKey] ?? {};
  const next = FLAG_EVENTS.has(name) ? 1 : (day[name] ?? 0) + amount;
  await dayEvents.setValue({ ...map, [dateKey]: { ...day, [name]: next } });
}

/**
 * Adds `amount` to a day's counter. Background only: the lock is per JS context, so calling this
 * from the popup or options page would race with the background's writes.
 */
export function recordEvent(dateKey: string, name: DayEventName, amount = 1): Promise<void> {
  return serialize(() => recordEventLocked(dateKey, name, amount));
}

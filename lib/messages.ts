import type { DayEventName, DayEvents, Mode } from './storage';

/**
 * Messages from the popup, options, blocked/limit pages (and later content scripts) to the
 * background. Everything is a closed union with fixed fields: no free-form strings, URLs, hostnames
 * or dates travel this way. The background validates every message with `parseMessage` before acting.
 */
export type Message =
  | { type: 'SYNC' }
  | { type: 'GET_STATE' }
  | { type: 'RECORD_EVENT'; name: MessageEventName; amount?: number }
  | { type: 'START_SESSION'; kind: 'short' | 'long'; durationMinutes?: number }
  | { type: 'END_SESSION' }
  | { type: 'START_HARD_BLOCK'; durationMinutes: number }
  | { type: 'END_HARD_BLOCK' };

export type MessageType = Message['type'];

/**
 * Counters other contexts may ask the background to bump. The rest of DAY_EVENT_NAMES (goalReached,
 * sessionsCompleted, tabsAutoClosed) are derived by the background itself and cannot be set from a message.
 */
export const MESSAGE_EVENT_NAMES = ['unlocksUsed', 'checklistDone', 'xpEarned'] as const satisfies readonly DayEventName[];
export type MessageEventName = (typeof MESSAGE_EVENT_NAMES)[number];

export const MAX_EVENT_AMOUNT = 1000;
/** Upper bound for a session or hard block: one week. */
export const MAX_DURATION_MINUTES = 7 * 24 * 60;

export function isValidDurationMinutes(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 1 && n <= MAX_DURATION_MINUTES;
}

/** Read-only snapshot for GET_STATE: numbers and mode only, no sites. */
export interface StateSnapshot {
  mode: Mode;
  poolSeconds: number;
  /** Today's counters (a missing counter means 0). */
  today: DayEvents;
}

export type ReplyError = 'invalid-message' | 'untrusted-sender' | 'failed';

export type Reply = { ok: true; state?: StateSnapshot } | { ok: false; error: ReplyError };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** True when `obj` has no keys beyond `allowed`, so extra fields cannot ride along. */
function onlyKeys(obj: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(obj).every((k) => allowed.includes(k));
}

/**
 * Validates untrusted input and returns a clean Message that is rebuilt field by field, or null.
 * Rejects unknown types, missing or extra fields, wrong types and out-of-range numbers.
 */
export function parseMessage(raw: unknown): Message | null {
  if (!isPlainObject(raw) || typeof raw.type !== 'string') return null;

  switch (raw.type) {
    case 'SYNC':
    case 'GET_STATE':
    case 'END_SESSION':
    case 'END_HARD_BLOCK':
      return onlyKeys(raw, ['type']) ? { type: raw.type } : null;

    case 'RECORD_EVENT': {
      if (!onlyKeys(raw, ['type', 'name', 'amount'])) return null;
      if (!(MESSAGE_EVENT_NAMES as readonly unknown[]).includes(raw.name)) return null;
      const name = raw.name as MessageEventName;
      if (raw.amount === undefined) return { type: 'RECORD_EVENT', name };
      const { amount } = raw;
      if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 1 || amount > MAX_EVENT_AMOUNT) return null;
      return { type: 'RECORD_EVENT', name, amount };
    }

    case 'START_SESSION': {
      if (!onlyKeys(raw, ['type', 'kind', 'durationMinutes'])) return null;
      if (raw.kind === 'short') return raw.durationMinutes === undefined ? { type: 'START_SESSION', kind: 'short' } : null;
      if (raw.kind !== 'long') return null;
      if (raw.durationMinutes === undefined) return { type: 'START_SESSION', kind: 'long' };
      return isValidDurationMinutes(raw.durationMinutes)
        ? { type: 'START_SESSION', kind: 'long', durationMinutes: raw.durationMinutes }
        : null;
    }

    case 'START_HARD_BLOCK':
      if (!onlyKeys(raw, ['type', 'durationMinutes'])) return null;
      return isValidDurationMinutes(raw.durationMinutes) ? { type: 'START_HARD_BLOCK', durationMinutes: raw.durationMinutes } : null;

    default:
      return null;
  }
}

/** Sends a message to the background. Resolves with its reply; a refused message is `{ ok: false }`, not a rejection. */
export async function sendMessage(message: Message): Promise<Reply> {
  return browser.runtime.sendMessage(message);
}

/** Asks the background for the read-only state snapshot. */
export async function getState(): Promise<StateSnapshot> {
  const reply = await sendMessage({ type: 'GET_STATE' });
  if (!reply.ok || !reply.state) throw new Error(`GET_STATE failed${reply.ok ? '' : `: ${reply.error}`}`);
  return reply.state;
}

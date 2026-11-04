import { describe, expect, it } from 'vitest';
import { MAX_DURATION_MINUTES, MAX_EVENT_AMOUNT, MESSAGE_EVENT_NAMES, parseMessage } from './messages';
import { DAY_EVENT_NAMES } from './storage';

describe('parseMessage: valid messages', () => {
  it.each([
    [{ type: 'SYNC' }],
    [{ type: 'GET_STATE' }],
    [{ type: 'END_SESSION' }],
    [{ type: 'END_HARD_BLOCK' }],
    [{ type: 'START_SESSION', kind: 'short' }],
    [{ type: 'START_SESSION', kind: 'long' }],
    [{ type: 'START_SESSION', kind: 'long', durationMinutes: 90 }],
    [{ type: 'START_SESSION', kind: 'long', durationMinutes: 1.5 }],
    [{ type: 'START_HARD_BLOCK', durationMinutes: 60 }],
    [{ type: 'START_HARD_BLOCK', durationMinutes: MAX_DURATION_MINUTES }],
    [{ type: 'RECORD_EVENT', name: 'unlocksUsed' }],
    [{ type: 'RECORD_EVENT', name: 'xpEarned', amount: 25 }],
    [{ type: 'RECORD_EVENT', name: 'checklistDone', amount: MAX_EVENT_AMOUNT }],
  ])('accepts %j unchanged', (msg) => {
    expect(parseMessage(msg)).toEqual(msg);
  });

  it('returns a rebuilt copy, not the object it was given', () => {
    const raw = { type: 'RECORD_EVENT', name: 'unlocksUsed' };
    expect(parseMessage(raw)).not.toBe(raw);
  });

  it('accepts only the counters that are not derived by the background itself', () => {
    const derived = DAY_EVENT_NAMES.filter((n) => !(MESSAGE_EVENT_NAMES as readonly string[]).includes(n));
    expect(derived).toEqual(['goalReached', 'sessionsCompleted', 'tabsAutoClosed']);
  });
});

describe('parseMessage: invalid messages', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a string', 'SYNC'],
    ['a number', 7],
    ['an array', [{ type: 'SYNC' }]],
    ['an object without type', {}],
    ['a non-string type', { type: 5 }],
    ['an unknown type', { type: 'DELETE_EVERYTHING' }],
    ['a lowercase type', { type: 'sync' }],
    ['a prototype-polluting key', JSON.parse('{"type":"SYNC","__proto__":{"x":1}}')],
    ['a class instance', new (class Foo { type = 'SYNC'; })()],
  ])('rejects %s', (_label, raw) => {
    expect(parseMessage(raw)).toBeNull();
  });

  it.each([
    [{ type: 'SYNC', url: 'https://example.com' }],
    [{ type: 'GET_STATE', extra: 1 }],
    [{ type: 'END_SESSION', hostname: 'example.com' }],
    [{ type: 'START_SESSION', kind: 'long', durationMinutes: 30, note: 'x' }],
    [{ type: 'RECORD_EVENT', name: 'unlocksUsed', dateKey: '2020-01-01' }],
  ])('rejects extra fields: %j', (msg) => {
    expect(parseMessage(msg)).toBeNull();
  });

  it.each([
    [{ type: 'START_SESSION' }],
    [{ type: 'START_SESSION', kind: 'medium' }],
    [{ type: 'START_SESSION', kind: 'short', durationMinutes: 30 }],
    [{ type: 'START_SESSION', kind: 'long', durationMinutes: '30' }],
    [{ type: 'START_SESSION', kind: 'long', durationMinutes: null }],
    [{ type: 'START_HARD_BLOCK' }],
    [{ type: 'START_HARD_BLOCK', durationMinutes: undefined }],
  ])('rejects missing or mistyped fields: %j', (msg) => {
    expect(parseMessage(msg)).toBeNull();
  });

  it.each([0, 0.5, -5, NaN, Infinity, -Infinity, MAX_DURATION_MINUTES + 1, 1e12])('rejects the duration %s', (durationMinutes) => {
    expect(parseMessage({ type: 'START_HARD_BLOCK', durationMinutes })).toBeNull();
    expect(parseMessage({ type: 'START_SESSION', kind: 'long', durationMinutes })).toBeNull();
  });

  it.each(['goalReached', 'sessionsCompleted', 'tabsAutoClosed', 'nope', '', 5, null, undefined])(
    'rejects the event name %j',
    (name) => {
      expect(parseMessage({ type: 'RECORD_EVENT', name })).toBeNull();
    },
  );

  it.each([0, -1, 1.5, NaN, Infinity, MAX_EVENT_AMOUNT + 1, '3', null])('rejects the event amount %j', (amount) => {
    expect(parseMessage({ type: 'RECORD_EVENT', name: 'xpEarned', amount })).toBeNull();
  });
});

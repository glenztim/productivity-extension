import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { recordEvent } from './dayEvents';
import { dayEvents, type DayEventName } from './storage';

beforeEach(() => {
  fakeBrowser.reset();
});

describe('recordEvent', () => {
  it('starts a missing day at the given amount and defaults to 1', async () => {
    await recordEvent('2025-03-01', 'unlocksUsed');
    await recordEvent('2025-03-01', 'xpEarned', 25);
    expect(await dayEvents.getValue()).toEqual({ '2025-03-01': { unlocksUsed: 1, xpEarned: 25 } });
  });

  it('accumulates counters per day without touching other days', async () => {
    await recordEvent('2025-03-01', 'tabsAutoClosed');
    await recordEvent('2025-03-01', 'tabsAutoClosed', 2);
    await recordEvent('2025-03-02', 'tabsAutoClosed');
    expect(await dayEvents.getValue()).toEqual({
      '2025-03-01': { tabsAutoClosed: 3 },
      '2025-03-02': { tabsAutoClosed: 1 },
    });
  });

  it('keeps flag events at 1 however often they are recorded', async () => {
    await recordEvent('2025-03-01', 'goalReached');
    await recordEvent('2025-03-01', 'goalReached');
    expect((await dayEvents.getValue())['2025-03-01']?.goalReached).toBe(1);
  });

  it('does not lose counts when many calls run concurrently', async () => {
    await Promise.all(Array.from({ length: 50 }, () => recordEvent('2025-03-01', 'sessionsCompleted')));
    expect((await dayEvents.getValue())['2025-03-01']?.sessionsCompleted).toBe(50);
  });

  it('does not lose counts across different events racing on the same day', async () => {
    await Promise.all([
      ...Array.from({ length: 20 }, () => recordEvent('2025-03-01', 'unlocksUsed')),
      ...Array.from({ length: 20 }, () => recordEvent('2025-03-01', 'checklistDone', 2)),
    ]);
    expect((await dayEvents.getValue())['2025-03-01']).toEqual({ unlocksUsed: 20, checklistDone: 40 });
  });

  it('rejects bad input and stores nothing', async () => {
    await expect(recordEvent('2025-03-01', 'nope' as DayEventName)).rejects.toThrow('unknown event');
    await expect(recordEvent('2025-3-1', 'unlocksUsed')).rejects.toThrow('invalid date key');
    await expect(recordEvent('2025-03-01', 'xpEarned', 0)).rejects.toThrow('amount');
    await expect(recordEvent('2025-03-01', 'xpEarned', -5)).rejects.toThrow('amount');
    await expect(recordEvent('2025-03-01', 'xpEarned', NaN)).rejects.toThrow('amount');
    await expect(recordEvent('2025-03-01', 'xpEarned', '5' as unknown as number)).rejects.toThrow('amount');
    expect(await dayEvents.getValue()).toEqual({});
  });

  it('keeps accepting events after a rejected one', async () => {
    await expect(recordEvent('bad', 'unlocksUsed')).rejects.toThrow();
    await recordEvent('2025-03-01', 'unlocksUsed');
    expect((await dayEvents.getValue())['2025-03-01']?.unlocksUsed).toBe(1);
  });
});

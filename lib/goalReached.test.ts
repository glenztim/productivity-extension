import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { flush } from './accounting';
import { dayEvents, checkpoint, hourlyStats, settings, type Category, type HourlyStatsMap } from './storage';

const at = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) => new Date(y, mo - 1, d, h, mi, s).getTime();
const MIN = 60_000;

async function setGoalMinutes(minutes: number | undefined) {
  const cur = await settings.getValue();
  await settings.setValue({ ...cur, dailyGoodTargetMinutes: minutes });
}

async function startTracking(timestamp: number, category: Category = 'good') {
  await checkpoint.setValue({ timestamp, category, tabId: null });
}

const goodSecondsAt = (hour: number, seconds: number): HourlyStatsMap[string] => ({
  [hour]: { goodSeconds: seconds, badSeconds: 0, neutralSeconds: 0 },
});

beforeEach(() => {
  fakeBrowser.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('goalReached', () => {
  it('fires once when good time reaches the goal, and not again on later flushes', async () => {
    await setGoalMinutes(10);
    const setSpy = vi.spyOn(dayEvents, 'setValue');
    let t = at(2025, 6, 10, 9, 0);
    await startTracking(t);

    for (let i = 0; i < 4; i++) {
      t += 2 * MIN;
      await flush(t);
      // 2, 4, 6, 8 minutes: still short of the 10-minute goal
      expect((await dayEvents.getValue())['2025-06-10']?.goalReached).toBeUndefined();
    }

    t += 2 * MIN; // 10 minutes: exactly the goal counts as reached
    await flush(t);
    expect((await dayEvents.getValue())['2025-06-10']?.goalReached).toBe(1);

    for (let i = 0; i < 3; i++) {
      t += 2 * MIN;
      await flush(t);
    }
    expect((await dayEvents.getValue())['2025-06-10']).toEqual({ goalReached: 1 });
    expect(setSpy).toHaveBeenCalledTimes(1);
  });

  it('ignores neutral and bad time', async () => {
    await setGoalMinutes(1);
    const t = at(2025, 6, 10, 9, 0);
    for (const category of ['neutral', 'bad'] as const) {
      await startTracking(t, category);
      await flush(t + 2 * MIN);
    }
    expect(await dayEvents.getValue()).toEqual({});
  });

  it('uses the default goal when the setting is absent', async () => {
    await setGoalMinutes(undefined);
    const t = at(2025, 6, 10, 9, 0);
    await hourlyStats.setValue({ '2025-06-10': goodSecondsAt(8, 240 * 60 - 60) });
    await startTracking(t);
    await flush(t + MIN);
    expect((await dayEvents.getValue())['2025-06-10']?.goalReached).toBe(1);
  });

  it('credits a goal reached exactly at midnight to the day that ended', async () => {
    await setGoalMinutes(10);
    // 9 minutes already banked on the 10th; the last minute before midnight completes the goal.
    await hourlyStats.setValue({ '2025-06-10': goodSecondsAt(10, 540) });
    await startTracking(at(2025, 6, 10, 23, 59));
    await flush(at(2025, 6, 11, 0, 1));

    const events = await dayEvents.getValue();
    expect(events['2025-06-10']?.goalReached).toBe(1);
    expect(events['2025-06-11']).toBeUndefined();
  });

  it('does not backdate a goal reached just after midnight', async () => {
    await setGoalMinutes(10);
    // One second short at midnight on the 10th; the next day only has the minute after midnight.
    await hourlyStats.setValue({ '2025-06-10': goodSecondsAt(10, 539) });
    await startTracking(at(2025, 6, 10, 23, 59));
    await flush(at(2025, 6, 11, 0, 1));
    // 539s + the 60s before midnight is 599s on the 10th, so it falls short and day 11 has only 60s.
    expect(await dayEvents.getValue()).toEqual({});

    await hourlyStats.setValue({ '2025-06-10': goodSecondsAt(10, 539), '2025-06-11': goodSecondsAt(0, 540) });
    await startTracking(at(2025, 6, 11, 0, 1));
    await flush(at(2025, 6, 11, 0, 2));
    const events = await dayEvents.getValue();
    expect(events['2025-06-11']?.goalReached).toBe(1);
    expect(events['2025-06-10']).toBeUndefined();
  });

  it('keeps a reached day when the goal is raised, and leaves untouched past days alone when it is lowered', async () => {
    await setGoalMinutes(10);
    await hourlyStats.setValue({ '2025-06-01': goodSecondsAt(9, 300) });
    await startTracking(at(2025, 6, 10, 9, 0));
    for (const minute of [2, 4, 6, 8, 10]) await flush(at(2025, 6, 10, 9, minute));
    expect((await dayEvents.getValue())['2025-06-10']?.goalReached).toBe(1);

    await setGoalMinutes(1000);
    await flush(at(2025, 6, 10, 9, 12));
    expect((await dayEvents.getValue())['2025-06-10']?.goalReached).toBe(1);

    // Lowering the goal below what the 1st reached must not retroactively flag it.
    await setGoalMinutes(1);
    await flush(at(2025, 6, 10, 9, 14));
    expect((await dayEvents.getValue())['2025-06-01']).toBeUndefined();
  });

  it('still credits tracked time when recording the event fails', async () => {
    await setGoalMinutes(1);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(dayEvents, 'getValue').mockRejectedValue(new Error('storage down'));
    const t = at(2025, 6, 10, 9, 0);
    await startTracking(t);

    await expect(flush(t + 2 * MIN)).resolves.toBeUndefined();
    expect((await hourlyStats.getValue())['2025-06-10']?.[9]?.goodSeconds).toBe(120);
    expect((await checkpoint.getValue()).timestamp).toBe(t + 2 * MIN);
  });
});

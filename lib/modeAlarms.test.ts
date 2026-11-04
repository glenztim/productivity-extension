import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { restoreModeAlarms } from './accounting';
import { activeMode, type Mode } from './storage';

const NOW = new Date(2025, 5, 10, 9, 0, 0).getTime();
const MIN = 60_000;

const session = (endsAt: number): Mode => ({ type: 'session', kind: 'short', startedAt: NOW - 10 * MIN, endsAt });
const hardBlock = (endsAt: number): Mode => ({ type: 'hardBlock', startedAt: NOW - 10 * MIN, endsAt });

beforeEach(() => {
  fakeBrowser.reset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  return () => vi.useRealTimers();
});

describe('restoreModeAlarms', () => {
  it('re-creates the sessionEnd alarm that a browser restart removed', async () => {
    await activeMode.setValue(session(NOW + 30 * MIN));
    await restoreModeAlarms();
    expect((await fakeBrowser.alarms.get('sessionEnd'))?.scheduledTime).toBe(NOW + 30 * MIN);
  });

  it('re-creates the hardBlockEnd alarm', async () => {
    await activeMode.setValue(hardBlock(NOW + 45 * MIN));
    await restoreModeAlarms();
    expect((await fakeBrowser.alarms.get('hardBlockEnd'))?.scheduledTime).toBe(NOW + 45 * MIN);
    expect(await fakeBrowser.alarms.get('sessionEnd')).toBeUndefined();
  });

  it('leaves an alarm that is still there alone', async () => {
    await activeMode.setValue(session(NOW + 30 * MIN));
    await fakeBrowser.alarms.create('sessionEnd', { when: NOW + 29 * MIN });
    await restoreModeAlarms();
    expect((await fakeBrowser.alarms.get('sessionEnd'))?.scheduledTime).toBe(NOW + 29 * MIN);
  });

  it('ends a session whose time ran out while the browser was closed', async () => {
    await activeMode.setValue(session(NOW - MIN));
    await restoreModeAlarms();
    expect(await activeMode.getValue()).toEqual({ type: 'free' });
    expect(await fakeBrowser.alarms.get('sessionEnd')).toBeUndefined();
  });

  it('ends a hard block whose time ran out while the browser was closed', async () => {
    await activeMode.setValue(hardBlock(NOW - MIN));
    await restoreModeAlarms();
    expect(await activeMode.getValue()).toEqual({ type: 'free' });
  });

  it('does nothing in free mode', async () => {
    await restoreModeAlarms();
    expect(await fakeBrowser.alarms.getAll()).toEqual([]);
    expect(await activeMode.getValue()).toEqual({ type: 'free' });
  });
});

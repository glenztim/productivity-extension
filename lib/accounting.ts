import {
  DEFAULT_DAILY_TARGET_MINUTES,
  activeMode,
  checkpoint,
  dayEvents,
  hourlyStats,
  poolBalanceSeconds,
  settings,
  type Category,
  type Checkpoint,
  type DayStats,
  type HourlyStatsMap,
} from './storage';
import { categorize, safeHostname } from './categorize';
import { poolPerGoodSecond } from './ratios';
import { splitByLocalHour } from './dateUtils';
import { enforceBlockingAcrossAllTabs } from './blocking';
import { updateBadge } from './badge';
import { serialize } from './mutex';
import { recordEventLocked } from './dayEvents';
import { getDayTotals } from './dayStats';
import { LEVEL_REACHED_FROM, dayProgress } from './score';

const EMPTY_HOUR: DayStats = { goodSeconds: 0, badSeconds: 0, neutralSeconds: 0 };

const HEARTBEAT_MS = 60_000;
/**
 * The heartbeat flushes every minute while anything is tracked, so a longer gap means the browser
 * was closed, crashed or asleep. That time is dropped rather than credited to the stale checkpoint.
 */
const MAX_CREDIT_GAP_MS = 3 * HEARTBEAT_MS;

/** Credits the interval to hourly stats and returns the updated map plus every local day it touched. */
async function addElapsedToHourlyStats(
  from: number,
  to: number,
  category: Category,
): Promise<{ map: HourlyStatsMap; dateKeys: string[] } | null> {
  if (category === 'none') return null;
  const key = category === 'good' ? 'goodSeconds' : category === 'bad' ? 'badSeconds' : 'neutralSeconds';
  const map = await hourlyStats.getValue();
  const next = { ...map };
  const dateKeys = new Set<string>();
  for (const seg of splitByLocalHour(from, to)) {
    const day = { ...next[seg.dateKey] };
    const hour = day[seg.hour] ?? EMPTY_HOUR;
    day[seg.hour] = { ...hour, [key]: hour[key] + seg.seconds };
    next[seg.dateKey] = day;
    dateKeys.add(seg.dateKey);
  }
  await hourlyStats.setValue(next);
  return { map: next, dateKeys: [...dateKeys] };
}

/**
 * Records `goalReached` once for each given day whose good time has reached the daily goal. The goal
 * is read now, and the flag is never cleared, so changing the goal later does not rewrite past days.
 * Event bookkeeping must never cost tracked time, so failures are logged and swallowed.
 * Caller must hold the accounting lock (`serialize`).
 */
async function recordGoalReached(hourly: HourlyStatsMap, dateKeys: string[]): Promise<void> {
  try {
    const events = await dayEvents.getValue();
    const pending = dateKeys.filter((k) => !events[k]?.goalReached);
    if (pending.length === 0) return;

    const config = await settings.getValue();
    const goalSeconds = (config.dailyGoodTargetMinutes ?? DEFAULT_DAILY_TARGET_MINUTES) * 60;
    for (const dateKey of pending) {
      const progress = dayProgress(getDayTotals({ hourly, legacy: {} }, dateKey), goalSeconds);
      if (progress !== null && progress >= LEVEL_REACHED_FROM) await recordEventLocked(dateKey, 'goalReached');
    }
  } catch (err) {
    console.error('Failed to record goalReached', err);
  }
}

async function addToPool(deltaSeconds: number) {
  const cur = await poolBalanceSeconds.getValue();
  await poolBalanceSeconds.setValue(Math.max(0, cur + deltaSeconds));
}

/** Caller must hold the accounting lock (`serialize`). */
async function flushLocked(now: number): Promise<void> {
  const cp = await checkpoint.getValue();
  const elapsedMs = now - cp.timestamp;
  if (elapsedMs <= 0) return;
  if (cp.category === 'none' || elapsedMs > MAX_CREDIT_GAP_MS) {
    await checkpoint.setValue({ ...cp, timestamp: now });
    return;
  }

  const credited = await addElapsedToHourlyStats(cp.timestamp, now, cp.category);
  if (credited && cp.category === 'good') await recordGoalReached(credited.map, credited.dateKeys);

  const mode = await activeMode.getValue();
  const elapsedSec = elapsedMs / 1000;
  if (mode.type === 'session') {
    if (cp.category === 'good') {
      await addToPool(elapsedSec * (await poolPerGoodSecond()));
    } else if (cp.category === 'bad') {
      await addToPool(-elapsedSec);
    }
  } else if (mode.type === 'hardBlock') {
    // The whole hard-block duration counts as earning, regardless of category.
    await addToPool(elapsedSec * (await poolPerGoodSecond()));
  }

  await checkpoint.setValue({ ...cp, timestamp: now });
}

/** Closes out elapsed time under the checkpoint's OLD category/mode before anything else changes. */
export function flush(now?: number): Promise<void> {
  return serialize(() => flushLocked(now ?? Date.now()));
}

async function currentFocusedTab(): Promise<{ tabId: number; url: string } | null> {
  const win = await browser.windows.getLastFocused({ windowTypes: ['normal'] });
  if (!win?.focused || win.id === undefined || win.id === browser.windows.WINDOW_ID_NONE) return null;
  const [tab] = await browser.tabs.query({ active: true, windowId: win.id });
  if (!tab?.id || !tab.url) return null;
  return { tabId: tab.id, url: tab.url };
}

/** Re-evaluates what's currently being looked at, flushing the old checkpoint first, then reschedules alarms. */
export async function recomputeCurrentActivity(): Promise<void> {
  await serialize(async () => {
    const now = Date.now();
    await flushLocked(now);

    let category: Checkpoint['category'] = 'none';
    let tabId: number | null = null;
    let hostname: string | null = null;

    const focused = await currentFocusedTab();
    if (focused) {
      const h = safeHostname(focused.url);
      if (h) {
        hostname = h;
        category = await categorize(h);
        tabId = focused.tabId;
      }
    }

    await checkpoint.setValue({ timestamp: now, category, tabId, hostname });
  });
  await scheduleAlarms();
}

export async function scheduleAlarms(): Promise<void> {
  await browser.alarms.clear('depletion');
  await browser.alarms.clear('heartbeat');

  const mode = await activeMode.getValue();
  const cp = await checkpoint.getValue();

  if (cp.category !== 'none') {
    // Backstop so long uninterrupted dwell time (no nav/focus events) still gets flushed periodically.
    browser.alarms.create('heartbeat', { when: Date.now() + HEARTBEAT_MS });
  }

  if (mode.type === 'session' && cp.category === 'bad') {
    const pool = await poolBalanceSeconds.getValue();
    if (pool > 0) {
      browser.alarms.create('depletion', { when: Date.now() + pool * 1000 });
    } else {
      await enforceBlockingAcrossAllTabs();
    }
  }

  await updateBadge();
}

export async function handleAlarm(name: string): Promise<void> {
  if (name === 'heartbeat' || name === 'depletion') {
    await flush();
    if (name === 'depletion' && (await poolBalanceSeconds.getValue()) <= 0) {
      await enforceBlockingAcrossAllTabs();
    }
    await scheduleAlarms();
  } else if (name === 'sessionEnd' || name === 'hardBlockEnd') {
    await flush();
    await activeMode.setValue({ type: 'free' });
    await browser.alarms.clear('depletion');
    await browser.alarms.clear('heartbeat');
    await recomputeCurrentActivity();
  }
}

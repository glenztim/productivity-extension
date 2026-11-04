import {
  tabLimitCounted,
  tabLimitGraceUntil,
  tabLimitSessionStarted,
  tabLimits,
  type TabLimitEntry,
} from './storage';
import { matchesPattern, safeHostname } from './categorize';
import { serialize } from './mutex';
import { recordEventLocked } from './dayEvents';
import { localDateKey } from './dateUtils';

/** After browser start, tabs are counted but not closed for this long, so session restore keeps all its tabs. */
export const TAB_LIMIT_GRACE_MS = 5_000;

/**
 * Which limit each tab currently counts toward (see `tabLimitCounted`). It lets a tab navigating
 * within an already-counted site pass, so only tabs that *enter* a limited site can be closed.
 *
 * Kept in storage.session because the background is an event page that Firefox suspends after
 * ~30s idle; module state would be lost each time. If storage.session is unavailable or fails,
 * this falls back to module memory, where a restart just makes tabs count as entering again.
 */
let memoryCounted: Record<string, string> = {};

async function readCounted(): Promise<Record<string, string>> {
  try {
    return await tabLimitCounted.getValue();
  } catch {
    return memoryCounted;
  }
}

async function writeCounted(next: Record<string, string>): Promise<void> {
  try {
    await tabLimitCounted.setValue(next);
  } catch {
    memoryCounted = next;
  }
}

/** Caller must hold the accounting lock (`serialize`). */
async function getCounted(tabId: number): Promise<string | undefined> {
  return (await readCounted())[tabId];
}

/** Caller must hold the accounting lock (`serialize`). */
async function setCounted(tabId: number, limitId: string): Promise<void> {
  const map = await readCounted();
  if (map[tabId] !== limitId) await writeCounted({ ...map, [tabId]: limitId });
}

/** Caller must hold the accounting lock (`serialize`). */
async function clearCounted(tabId: number): Promise<void> {
  const map = await readCounted();
  if (!(tabId in map)) return;
  const { [tabId]: _removed, ...rest } = map;
  await writeCounted(rest);
}

/** The most specific (longest) limit pattern matching the hostname, so music.youtube.com beats youtube.com. */
function pickLimit(limits: TabLimitEntry[], hostname: string): TabLimitEntry | undefined {
  let best: TabLimitEntry | undefined;
  for (const l of limits) {
    if (matchesPattern(hostname, l.pattern) && (!best || l.pattern.length > best.pattern.length)) best = l;
  }
  return best;
}

/** One notification per limit (fixed id), so a burst of closed tabs replaces it instead of piling up. Shows only the user's own entry. */
async function notifyClosed(limit: TabLimitEntry): Promise<void> {
  try {
    await browser.notifications.create(`tab-limit-${limit.id}`, {
      type: 'basic',
      iconUrl: browser.runtime.getURL('/icon/128.png'),
      title: 'Focused Time: Tab limit reached',
      message: `${limit.pattern} is limited to ${limit.maxTabs} ${limit.maxTabs === 1 ? 'tab' : 'tabs'}. The new tab was closed.`,
    });
  } catch (err) {
    console.error('Failed to show tab limit notification', err);
  }
}

function limitReachedUrl(limit: TabLimitEntry): string {
  return `${browser.runtime.getURL('/limit-reached.html')}?limit=${encodeURIComponent(limit.id)}`;
}

/** Only called once a tab was actually closed or emptied, so each one is recorded exactly once. */
async function recordAutoClosed(): Promise<void> {
  try {
    await recordEventLocked(localDateKey(Date.now()), 'tabsAutoClosed');
  } catch (err) {
    console.error('Failed to record tabsAutoClosed', err);
  }
}

/** Caller must hold the accounting lock (`serialize`), so concurrent checks see each other's closures. */
async function enforceLocked(tabId: number): Promise<void> {
  // Re-read the tab: the event's snapshot may be stale by the time this check gets its turn.
  const tab = await browser.tabs.get(tabId).catch(() => null);
  if (!tab) {
    await clearCounted(tabId);
    return;
  }
  const hostname = tab.url ? safeHostname(tab.url) : null;
  if (!hostname) {
    // Blank or non-web page: wait for a real URL.
    await clearCounted(tabId);
    return;
  }

  const limit = pickLimit(await tabLimits.getValue(), hostname);
  if (!limit || tab.pinned) {
    await clearCounted(tabId);
    return;
  }
  if ((await getCounted(tabId)) === limit.id) return;
  await setCounted(tabId, limit.id);
  if (Date.now() < (await tabLimitGraceUntil.getValue())) return;

  const tabs = await browser.tabs.query({});
  const others = tabs.filter((t) => {
    if (t.id === tabId || t.pinned) return false;
    const h = t.url ? safeHostname(t.url) : null;
    return h !== null && matchesPattern(h, limit.pattern);
  });
  if (others.length < limit.maxTabs) return;

  // Closing the last tab of a window would close the window (and possibly the browser). Navigate it
  // to our own page instead; the URL carries only the limit's id.
  const lastInWindow = tab.windowId !== undefined && (await browser.tabs.query({ windowId: tab.windowId })).length <= 1;
  if (lastInWindow) {
    try {
      await browser.tabs.update(tabId, { url: limitReachedUrl(limit) });
    } catch {
      return; // already gone
    }
    await clearCounted(tabId);
    await recordAutoClosed();
    return;
  }

  try {
    await browser.tabs.remove(tabId);
  } catch {
    return; // already gone
  }
  await clearCounted(tabId);
  await recordAutoClosed();
  await notifyClosed(limit);
}

/** Checks one tab against the limits. Never rejects, so a failure cannot break the event listeners. */
export function enforceTabLimit(tabId: number): Promise<void> {
  return serialize(() => enforceLocked(tabId)).catch((err) => {
    console.error('Tab limit check failed', err);
  });
}

/** Starts the post-startup grace period. Stored (not in memory) because the background can restart at any time. */
export function startTabLimitGrace(): Promise<void> {
  return serialize(() => tabLimitGraceUntil.setValue(Date.now() + TAB_LIMIT_GRACE_MS));
}

/**
 * Starts the grace period if this browser session has not been seen yet (no session marker), then sets
 * the marker. Called as the background script starts, so it does not depend on whether, or in what
 * order, onStartup and the session-restore tab events arrive. Later wake-ups from suspension find the
 * marker and do nothing. Also runs after an extension install, enable, reload or update, where a short
 * grace period is harmless. Without storage.session there is no marker, so only onStartup starts grace.
 * Never rejects.
 */
export function ensureTabLimitSession(): Promise<void> {
  return serialize(async () => {
    if (await tabLimitSessionStarted.getValue()) return;
    await tabLimitGraceUntil.setValue(Date.now() + TAB_LIMIT_GRACE_MS);
    await tabLimitSessionStarted.setValue(true);
  }).catch((err) => {
    console.warn('Could not start the tab limit grace period from the session marker', err);
  });
}

/** Drops the module-memory fallback, as a background restart would (tests only). Session storage is untouched. */
export function resetTabLimitState(): void {
  memoryCounted = {};
}

export function registerTabLimits(): void {
  // Queue the session check before any event can be handled: this runs while the script starts, and
  // events are only dispatched afterwards, so every check below runs after the grace period is set.
  ensureTabLimitSession();

  browser.tabs.onCreated.addListener((tab) => {
    if (tab.id !== undefined) enforceTabLimit(tab.id);
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url) enforceTabLimit(tabId);
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    serialize(() => clearCounted(tabId)).catch((err) => console.error('Failed to forget closed tab', err));
  });

  browser.runtime.onStartup.addListener(() => {
    startTabLimitGrace().catch((err) => console.error('Failed to start tab limit grace period', err));
  });
}

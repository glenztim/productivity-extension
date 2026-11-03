import { tabLimitGraceUntil, tabLimits, type TabLimitEntry } from './storage';
import { matchesPattern, safeHostname } from './categorize';
import { serialize } from './mutex';

/** After browser start, tabs are counted but not closed for this long, so session restore keeps all its tabs. */
export const TAB_LIMIT_GRACE_MS = 5_000;

/**
 * tabId -> id of the limit the tab currently counts toward. Ids only, never hostnames. It lets a
 * tab navigating within an already-counted site pass, so only tabs that *enter* a limited site can
 * be closed. In memory: after a background restart a tab is simply treated as entering again.
 */
const counted = new Map<number, string>();

/** The most specific (longest) limit pattern matching the hostname, so music.youtube.com beats youtube.com. */
function pickLimit(limits: TabLimitEntry[], hostname: string): TabLimitEntry | undefined {
  let best: TabLimitEntry | undefined;
  for (const l of limits) {
    if (matchesPattern(hostname, l.pattern) && (!best || l.pattern.length > best.pattern.length)) best = l;
  }
  return best;
}

/** Caller must hold the accounting lock (`serialize`), so concurrent checks see each other's closures. */
async function enforceLocked(tabId: number): Promise<void> {
  // Re-read the tab: the event's snapshot may be stale by the time this check gets its turn.
  const tab = await browser.tabs.get(tabId).catch(() => null);
  if (!tab) {
    counted.delete(tabId);
    return;
  }
  const hostname = tab.url ? safeHostname(tab.url) : null;
  if (!hostname) {
    // Blank or non-web page: wait for a real URL.
    counted.delete(tabId);
    return;
  }

  const limit = pickLimit(await tabLimits.getValue(), hostname);
  if (!limit || tab.pinned) {
    counted.delete(tabId);
    return;
  }
  if (counted.get(tabId) === limit.id) return;
  counted.set(tabId, limit.id);
  if (Date.now() < (await tabLimitGraceUntil.getValue())) return;

  const tabs = await browser.tabs.query({});
  const others = tabs.filter((t) => {
    if (t.id === tabId || t.pinned) return false;
    const h = t.url ? safeHostname(t.url) : null;
    return h !== null && matchesPattern(h, limit.pattern);
  });
  if (others.length < limit.maxTabs) return;

  try {
    await browser.tabs.remove(tabId);
  } catch {
    return; // already gone
  }
  counted.delete(tabId);
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

/** Clears the in-memory tab bookkeeping (tests only). */
export function resetTabLimitState(): void {
  counted.clear();
}

export function registerTabLimits(): void {
  browser.tabs.onCreated.addListener((tab) => {
    if (tab.id !== undefined) enforceTabLimit(tab.id);
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url) enforceTabLimit(tabId);
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    counted.delete(tabId);
  });

  browser.runtime.onStartup.addListener(() => {
    startTabLimitGrace().catch((err) => console.error('Failed to start tab limit grace period', err));
  });
}

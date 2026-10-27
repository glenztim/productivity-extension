import { tabLimits } from './storage';
import { matchesPattern, safeHostname } from './categorize';

/** Tabs created but not yet checked; their URL is often still blank when onCreated fires. */
const unchecked = new Set<number>();

async function enforceForTab(tabId: number, url: string | undefined): Promise<void> {
  const hostname = url ? safeHostname(url) : null;
  if (!hostname) return;
  unchecked.delete(tabId);

  const limits = await tabLimits.getValue();
  const limit = limits.find((l) => matchesPattern(hostname, l.pattern));
  if (!limit) return;

  const tabs = await browser.tabs.query({});
  const open = tabs.filter((t) => {
    const h = t.url ? safeHostname(t.url) : null;
    return h !== null && matchesPattern(h, limit.pattern);
  });
  if (open.length > limit.maxTabs) {
    await browser.tabs.remove(tabId).catch(() => {});
  }
}

export function registerTabLimits(): void {
  browser.tabs.onCreated.addListener((tab) => {
    if (tab.id === undefined) return;
    unchecked.add(tab.id);
    enforceForTab(tab.id, tab.pendingUrl ?? tab.url);
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url && unchecked.has(tabId)) {
      enforceForTab(tabId, changeInfo.url);
    }
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    unchecked.delete(tabId);
  });
}

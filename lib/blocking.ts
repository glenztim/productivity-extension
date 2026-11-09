import { activeMode, poolBalanceSeconds, type SiteEntry } from './storage';
import { findBlocklistEntry, safeHostname } from './categorize';
import { logError } from './logError';

export async function isBadSiteBlockingActive(): Promise<boolean> {
  const mode = await activeMode.getValue();
  if (mode.type === 'hardBlock') return true;
  if (mode.type === 'session') return (await poolBalanceSeconds.getValue()) <= 0;
  return false;
}

/**
 * The blocked page's URL carries only the id of the user's blocklist entry that matched, never the
 * visited hostname or URL. The page looks the entry up in storage; the original URL is not kept anywhere.
 */
export function blockedPageUrl(entry: SiteEntry): string {
  return `${browser.runtime.getURL('/blocked.html')}?entry=${encodeURIComponent(entry.id)}`;
}

export async function redirectToBlocked(tabId: number, entry: SiteEntry): Promise<void> {
  await browser.tabs.update(tabId, { url: blockedPageUrl(entry) });
}

/** Redirects any already-open tabs on a blocklisted site, not just future navigations. */
export async function enforceBlockingAcrossAllTabs(): Promise<void> {
  if (!(await isBadSiteBlockingActive())) return;
  const tabs = await browser.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id || !tab.url) continue;
    const h = safeHostname(tab.url);
    const entry = h ? await findBlocklistEntry(h) : undefined;
    if (!entry) continue;
    try {
      await redirectToBlocked(tab.id, entry);
    } catch (err) {
      // The tab can close between the query and the update. That must not stop the remaining tabs from being redirected.
      logError('Failed to redirect a tab to the blocked page', err);
    }
  }
}

export function registerNavigationBlocking(): void {
  browser.webNavigation.onBeforeNavigate.addListener(async ({ frameId, tabId, url }) => {
    if (frameId !== 0) return;
    try {
      const h = safeHostname(url);
      const entry = h ? await findBlocklistEntry(h) : undefined;
      if (!entry) return;
      if (await isBadSiteBlockingActive()) {
        await redirectToBlocked(tabId, entry);
      }
    } catch (err) {
      logError('Failed to check a navigation against the blocklist', err);
    }
  });
}

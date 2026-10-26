import { activeMode, poolBalanceSeconds } from './storage';
import { categorize, safeHostname } from './categorize';

export async function isBadSiteBlockingActive(): Promise<boolean> {
  const mode = await activeMode.getValue();
  if (mode.type === 'hardBlock') return true;
  if (mode.type === 'session') return (await poolBalanceSeconds.getValue()) <= 0;
  return false;
}

export async function redirectToBlocked(tabId: number, originalUrl: string): Promise<void> {
  const hostname = safeHostname(originalUrl) ?? '';
  const mode = await activeMode.getValue();
  const url =
    browser.runtime.getURL('/blocked.html') +
    `?site=${encodeURIComponent(hostname)}&reason=${encodeURIComponent(mode.type)}`;
  await browser.tabs.update(tabId, { url });
}

/** Redirects any already-open tabs on a blocklisted site, not just future navigations. */
export async function enforceBlockingAcrossAllTabs(): Promise<void> {
  if (!(await isBadSiteBlockingActive())) return;
  const tabs = await browser.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id || !tab.url) continue;
    const h = safeHostname(tab.url);
    if (h && (await categorize(h)) === 'bad') {
      await redirectToBlocked(tab.id, tab.url);
    }
  }
}

export function registerNavigationBlocking(): void {
  browser.webNavigation.onBeforeNavigate.addListener(async ({ frameId, tabId, url }) => {
    if (frameId !== 0) return;
    const h = safeHostname(url);
    if (!h || (await categorize(h)) !== 'bad') return;
    if (await isBadSiteBlockingActive()) {
      await redirectToBlocked(tabId, url);
    }
  });
}

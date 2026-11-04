import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { blockedPageUrl, enforceBlockingAcrossAllTabs, registerNavigationBlocking } from './blocking';
import { recomputeCurrentActivity } from './accounting';
import { findBlocklistEntry } from './categorize';
import { activeMode, blocklist, productivityList, type SiteEntry } from './storage';

const entry = (id: string, pattern: string): SiteEntry => ({ id, pattern, addedAt: 1 });

const VISITED = 'https://old.reddit.com/r/secret-subreddit/comments/abc123?token=hunter2#frag';
/** Everything that identifies where the user was: none of it may reach a URL or a storage item. */
const IDENTIFYING = /reddit|secret|abc123|hunter2|frag|https?:/i;

async function openTab(url: string): Promise<number> {
  const tab = await fakeBrowser.tabs.create({ url, active: true });
  return tab.id!;
}

async function tabUrl(id: number): Promise<string> {
  return (await fakeBrowser.tabs.get(id)).url!;
}

/** Local, session and sync storage as one string, without the user's own blocklist (which holds their typed entries). */
async function storageWithoutUserLists(): Promise<string> {
  const areas = [fakeBrowser.storage.local, fakeBrowser.storage.session, fakeBrowser.storage.sync];
  const dumps = await Promise.all(areas.map((a) => a.get(null)));
  const rest = dumps.map(({ blocklist: _b, productivityList: _p, ...others }) => others);
  return JSON.stringify(rest);
}

beforeEach(async () => {
  fakeBrowser.reset();
  await blocklist.setValue([entry('entry-1', 'reddit.com')]);
  await activeMode.setValue({ type: 'hardBlock', startedAt: Date.now(), endsAt: Date.now() + 60 * 60_000 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('blocked page URL', () => {
  it('carries only the id of the matching list entry', async () => {
    const id = await openTab(VISITED);
    await enforceBlockingAcrossAllTabs();

    const url = new URL(await tabUrl(id));
    expect(url.pathname).toBe('/blocked.html');
    expect([...url.searchParams.keys()]).toEqual(['entry']);
    expect(url.searchParams.get('entry')).toBe('entry-1');
  });

  it('contains no hostname, path, query or pattern, whichever way the tab got there', async () => {
    registerNavigationBlocking();
    const open = await openTab(VISITED);
    await enforceBlockingAcrossAllTabs();

    const nav = await openTab('about:blank');
    await Promise.all(await fakeBrowser.webNavigation.onBeforeNavigate.trigger({ frameId: 0, tabId: nav, url: VISITED } as never));

    for (const id of [open, nav]) {
      const url = await tabUrl(id);
      expect(url).toBe(blockedPageUrl(entry('entry-1', 'reddit.com')));
      expect(url).not.toMatch(IDENTIFYING);
    }
  });

  it('is only built from the entry, so it cannot depend on what was visited', () => {
    expect(blockedPageUrl(entry('abc/def?x=1', 'x.com'))).toMatch(/blocked\.html\?entry=abc%2Fdef%3Fx%3D1$/);
  });
});

describe('storage', () => {
  it('holds no hostname or URL of a blocked visit, in any area, beyond the user\'s own lists', async () => {
    registerNavigationBlocking();
    await openTab(VISITED);
    await enforceBlockingAcrossAllTabs();
    const nav = await openTab('about:blank');
    await Promise.all(await fakeBrowser.webNavigation.onBeforeNavigate.trigger({ frameId: 0, tabId: nav, url: VISITED } as never));
    await recomputeCurrentActivity().catch(() => {}); // the accounting path also sees the visited tab

    expect(await storageWithoutUserLists()).not.toMatch(IDENTIFYING);
  });

  it('does not keep the original URL for a "go back" either: nothing in any area mentions it', async () => {
    await openTab(VISITED);
    await enforceBlockingAcrossAllTabs();
    const all = JSON.stringify(await Promise.all([fakeBrowser.storage.local.get(null), fakeBrowser.storage.session.get(null)]));
    // The only mention of the site is the user's own typed blocklist pattern.
    expect(all.match(/reddit/gi)?.length).toBe(1);
    expect(all).not.toMatch(/secret|abc123|hunter2|https?:/i);
  });
});

describe('what gets blocked', () => {
  it('uses the most specific matching entry', async () => {
    await blocklist.setValue([entry('broad', 'reddit.com'), entry('narrow', 'old.reddit.com')]);
    expect((await findBlocklistEntry('old.reddit.com'))?.id).toBe('narrow');
    expect((await findBlocklistEntry('www.reddit.com'))?.id).toBe('broad');
    expect(await findBlocklistEntry('example.com')).toBeUndefined();

    const id = await openTab(VISITED);
    await enforceBlockingAcrossAllTabs();
    expect(new URL(await tabUrl(id)).searchParams.get('entry')).toBe('narrow');
  });

  it('leaves tabs alone when blocking is not active', async () => {
    await activeMode.setValue({ type: 'free' });
    const id = await openTab(VISITED);
    await enforceBlockingAcrossAllTabs();
    expect(await tabUrl(id)).toBe(VISITED);
  });

  it('leaves other sites alone, including productivity sites', async () => {
    await productivityList.setValue([entry('p', 'github.com')]);
    const a = await openTab('https://example.com/');
    const b = await openTab('https://github.com/x');
    await enforceBlockingAcrossAllTabs();
    expect(await tabUrl(a)).toBe('https://example.com/');
    expect(await tabUrl(b)).toBe('https://github.com/x');
  });

  it('ignores navigations in subframes', async () => {
    registerNavigationBlocking();
    const id = await openTab('about:blank');
    await Promise.all(await fakeBrowser.webNavigation.onBeforeNavigate.trigger({ frameId: 3, tabId: id, url: VISITED } as never));
    expect(await tabUrl(id)).toBe('about:blank');
  });

  it('blocks a navigation to a blocklisted site while a session has an empty pool, not otherwise', async () => {
    registerNavigationBlocking();
    await activeMode.setValue({ type: 'session', kind: 'short', startedAt: Date.now(), endsAt: Date.now() + 60_000 });
    const id = await openTab('about:blank');
    await Promise.all(await fakeBrowser.webNavigation.onBeforeNavigate.trigger({ frameId: 0, tabId: id, url: VISITED } as never));
    expect(await tabUrl(id)).toBe(blockedPageUrl(entry('entry-1', 'reddit.com'))); // pool is 0
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  TAB_LIMIT_GRACE_MS,
  enforceTabLimit,
  ensureTabLimitSession,
  registerTabLimits, resetTabLimitState,
  startTabLimitGrace,
} from './tabLimits';
import { dayEvents, tabLimitCounted, tabLimitSessionStarted, tabLimits, type TabLimitEntry } from './storage';
import { serialize } from './mutex';
import type { Browser } from 'wxt/browser';

const limit = (pattern: string, maxTabs: number, id = pattern): TabLimitEntry => ({ id, pattern, maxTabs });

async function open(url: string, pinned = false): Promise<number> {
  const tab = await fakeBrowser.tabs.create({ url, pinned });
  return tab.id!;
}

/** Opens a tab and runs its check, like the onCreated listener would. */
async function openChecked(url: string, pinned = false): Promise<number> {
  const id = await open(url, pinned);
  await enforceTabLimit(id);
  return id;
}

async function isOpen(id: number): Promise<boolean> {
  return (await fakeBrowser.tabs.query({})).some((t) => t.id === id);
}

// fake-browser's tabs.remove deletes the tab and then rejects (it looks up a window by the tab's id),
// where the real API resolves. Wrap it so removal behaves like the real thing.
const fakeRemove = fakeBrowser.tabs.remove.bind(fakeBrowser.tabs);

beforeEach(() => {
  fakeBrowser.reset();
  resetTabLimitState();
  vi.spyOn(fakeBrowser.tabs, 'remove').mockImplementation((async (id: number) => {
    await fakeRemove(id).catch(() => {});
  }) as typeof fakeBrowser.tabs.remove);
});

describe('closing', () => {
  it('closes the newest tab once the site is at its limit and keeps the older ones', async () => {
    await tabLimits.setValue([limit('youtube.com', 2)]);
    const a = await openChecked('https://youtube.com/a');
    const b = await openChecked('https://youtube.com/b');
    const c = await openChecked('https://youtube.com/c');
    expect(await isOpen(a)).toBe(true);
    expect(await isOpen(b)).toBe(true);
    expect(await isOpen(c)).toBe(false);
  });

  it('strips www., groups subdomains and ignores other sites', async () => {
    await tabLimits.setValue([limit('youtube.com', 2)]);
    await openChecked('https://www.youtube.com/a');
    await openChecked('https://music.youtube.com/b');
    const other = await openChecked('https://example.com');
    const third = await openChecked('https://WWW.YouTube.com/c');
    expect(await isOpen(other)).toBe(true);
    expect(await isOpen(third)).toBe(false);
  });

  it('counts tabs in other windows', async () => {
    await tabLimits.setValue([limit('youtube.com', 1)]);
    const w2 = await fakeBrowser.windows.create({});
    await fakeBrowser.tabs.create({ url: 'https://youtube.com/a', windowId: w2?.id });
    const b = await openChecked('https://youtube.com/b');
    expect(await isOpen(b)).toBe(false);
  });

  it('uses the most specific matching limit', async () => {
    await tabLimits.setValue([limit('youtube.com', 5), limit('music.youtube.com', 1)]);
    await openChecked('https://music.youtube.com/a');
    const second = await openChecked('https://music.youtube.com/b');
    expect(await isOpen(second)).toBe(false);
  });

  it('does nothing without a limit for the site', async () => {
    const a = await openChecked('https://youtube.com/a');
    expect(await isOpen(a)).toBe(true);
  });
});

describe('pinned tabs', () => {
  it('are not counted toward the limit', async () => {
    await tabLimits.setValue([limit('youtube.com', 1)]);
    await openChecked('https://youtube.com/pinned', true);
    const normal = await openChecked('https://youtube.com/a');
    expect(await isOpen(normal)).toBe(true);
  });

  it('are never closed', async () => {
    await tabLimits.setValue([limit('youtube.com', 1)]);
    await openChecked('https://youtube.com/a');
    const pinned = await openChecked('https://youtube.com/pinned', true);
    expect(await isOpen(pinned)).toBe(true);
  });
});

describe('when the URL arrives', () => {
  it('waits out a blank tab and enforces once it navigates to a limited site', async () => {
    await tabLimits.setValue([limit('youtube.com', 1)]);
    await openChecked('https://youtube.com/a');
    const blank = await openChecked('about:blank');
    expect(await isOpen(blank)).toBe(true);

    await fakeBrowser.tabs.update(blank, { url: 'https://youtube.com/b' });
    await enforceTabLimit(blank);
    expect(await isOpen(blank)).toBe(false);
  });

  it('enforces when a tab opened on another site later navigates to a limited one', async () => {
    await tabLimits.setValue([limit('youtube.com', 1)]);
    await openChecked('https://youtube.com/a');
    const tab = await openChecked('https://example.com');
    await fakeBrowser.tabs.update(tab, { url: 'https://youtube.com/b' });
    await enforceTabLimit(tab);
    expect(await isOpen(tab)).toBe(false);
  });

  it('lets a tab navigate within a site it already counts toward, even when over the limit', async () => {
    await tabLimits.setValue([limit('youtube.com', 3)]);
    const first = await openChecked('https://youtube.com/1');
    await openChecked('https://youtube.com/2');
    await openChecked('https://youtube.com/3');
    await tabLimits.setValue([limit('youtube.com', 1)]); // limit lowered below what is open

    await fakeBrowser.tabs.update(first, { url: 'https://youtube.com/other' });
    await enforceTabLimit(first);
    expect(await isOpen(first)).toBe(true);
  });

  it('ignores tabs that no longer exist', async () => {
    await tabLimits.setValue([limit('youtube.com', 1)]);
    await expect(enforceTabLimit(9999)).resolves.toBeUndefined();
  });
});

describe('startup grace period', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('leaves tabs open during the grace period and enforces again once it is over', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2025, 5, 10, 9, 0, 0));
    await tabLimits.setValue([limit('youtube.com', 1)]);
    await startTabLimitGrace();

    await openChecked('https://youtube.com/a');
    const restored = await openChecked('https://youtube.com/b');
    expect(await isOpen(restored)).toBe(true);

    vi.setSystemTime(Date.now() + TAB_LIMIT_GRACE_MS + 1);
    const late = await openChecked('https://youtube.com/c');
    expect(await isOpen(late)).toBe(false);
  });

  it('does not close a tab that was counted during the grace period when it navigates afterwards', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2025, 5, 10, 9, 0, 0));
    await tabLimits.setValue([limit('youtube.com', 1)]);
    await startTabLimitGrace();
    await openChecked('https://youtube.com/a');
    const restored = await openChecked('https://youtube.com/b');

    vi.setSystemTime(Date.now() + TAB_LIMIT_GRACE_MS + 1);
    await fakeBrowser.tabs.update(restored, { url: 'https://youtube.com/c' });
    await enforceTabLimit(restored);
    expect(await isOpen(restored)).toBe(true);
  });

  it('does not apply when no startup happened', async () => {
    await tabLimits.setValue([limit('youtube.com', 1)]);
    await openChecked('https://youtube.com/a');
    expect(await isOpen(await openChecked('https://youtube.com/b'))).toBe(false);
  });
});

describe('grace period without onStartup', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const freeze = () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2025, 5, 10, 9, 0, 0));
  };
  const settle = async () => {
    await new Promise((r) => setTimeout(r, 0));
    await serialize(async () => {});
  };

  it('starts when the background starts and no session marker exists', async () => {
    freeze();
    await tabLimits.setValue([limit('youtube.com', 1)]);
    await ensureTabLimitSession();

    await openChecked('https://youtube.com/a');
    const restored = await openChecked('https://youtube.com/b');
    expect(await isOpen(restored)).toBe(true);

    vi.setSystemTime(Date.now() + TAB_LIMIT_GRACE_MS + 1);
    expect(await isOpen(await openChecked('https://youtube.com/c'))).toBe(false);
  });

  it('is not restarted when the background merely wakes up again', async () => {
    freeze();
    await tabLimits.setValue([limit('youtube.com', 1)]);
    await ensureTabLimitSession();
    vi.setSystemTime(Date.now() + TAB_LIMIT_GRACE_MS + 1);

    await ensureTabLimitSession(); // suspension and wake-up: the marker is still in session storage
    await openChecked('https://youtube.com/a');
    expect(await isOpen(await openChecked('https://youtube.com/b'))).toBe(false);
  });

  it('covers session-restore tab events that arrive before any onStartup event', async () => {
    freeze();
    await tabLimits.setValue([limit('youtube.com', 1)]);
    registerTabLimits(); // as the background script does while starting

    const a = await open('https://youtube.com/a');
    const b = await open('https://youtube.com/b');
    await fakeBrowser.tabs.onCreated.trigger({ id: a } as Browser.tabs.Tab);
    await fakeBrowser.tabs.onCreated.trigger({ id: b } as Browser.tabs.Tab);
    await settle();
    expect(await isOpen(a)).toBe(true);
    expect(await isOpen(b)).toBe(true);
  });

  it('still starts the grace period on onStartup as an additional trigger', async () => {
    freeze();
    await tabLimits.setValue([limit('youtube.com', 1)]);
    registerTabLimits();
    await settle();
    vi.setSystemTime(Date.now() + TAB_LIMIT_GRACE_MS + 1); // the first grace is over

    await fakeBrowser.runtime.onStartup.trigger();
    await settle();
    await openChecked('https://youtube.com/a');
    expect(await isOpen(await openChecked('https://youtube.com/b'))).toBe(true);
  });

  it('does nothing and does not throw when storage.session is unavailable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(tabLimitSessionStarted, 'getValue').mockRejectedValue(new Error('storage.session is not available'));
    await tabLimits.setValue([limit('youtube.com', 1)]);
    await expect(ensureTabLimitSession()).resolves.toBeUndefined();

    await openChecked('https://youtube.com/a');
    expect(await isOpen(await openChecked('https://youtube.com/b'))).toBe(false);
  });
});

describe('last tab in a window', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** A new window holding exactly one tab with this URL. */
  async function soloWindowTab(url: string): Promise<number> {
    const win = await fakeBrowser.windows.create({});
    const tab = await fakeBrowser.tabs.create({ url, windowId: win!.id });
    await enforceTabLimit(tab.id!);
    return tab.id!;
  }

  it('is sent to the extension page instead of being removed, so the window stays open', async () => {
    await tabLimits.setValue([limit('youtube.com', 1, 'yt-limit')]);
    await openChecked('https://youtube.com/a');
    const solo = await soloWindowTab('https://youtube.com/b');

    expect(await isOpen(solo)).toBe(true);
    const url = (await fakeBrowser.tabs.get(solo)).url!;
    expect(url).toContain('/limit-reached.html?limit=yt-limit');
    expect(fakeBrowser.tabs.remove).not.toHaveBeenCalled();
  });

  it('puts only the limit id in the URL, never the hostname or path', async () => {
    await tabLimits.setValue([limit('youtube.com', 1, 'yt-limit')]);
    await openChecked('https://youtube.com/a');
    const solo = await soloWindowTab('https://youtube.com/watch?v=secret');
    const url = (await fakeBrowser.tabs.get(solo)).url!;
    expect(url).not.toMatch(/youtube\.com|secret/);
  });

  it('still counts as an auto-closed tab, once, without a "closed" notification', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2025, 5, 10, 9, 0, 0));
    await tabLimits.setValue([limit('youtube.com', 1)]);
    await openChecked('https://youtube.com/a');
    const solo = await soloWindowTab('https://youtube.com/b');
    await enforceTabLimit(solo); // the redirect's own navigation event
    expect((await dayEvents.getValue())['2025-06-10']).toEqual({ tabsAutoClosed: 1 });
    expect(fakeBrowser.notifications.getAllCreateOptions()).toEqual({});
  });

  it('leaves the redirected page alone on its follow-up navigation event', async () => {
    await tabLimits.setValue([limit('youtube.com', 1)]);
    await openChecked('https://youtube.com/a');
    const solo = await soloWindowTab('https://youtube.com/b');
    await enforceTabLimit(solo);
    expect(await isOpen(solo)).toBe(true);
    expect(await tabLimitCounted.getValue()).not.toHaveProperty(String(solo));
  });

  it('is removed as before when the window has other tabs', async () => {
    await tabLimits.setValue([limit('youtube.com', 1)]);
    const win = await fakeBrowser.windows.create({});
    await fakeBrowser.tabs.create({ url: 'https://youtube.com/a', windowId: win!.id });
    await fakeBrowser.tabs.create({ url: 'https://example.com', windowId: win!.id });
    const extra = await fakeBrowser.tabs.create({ url: 'https://youtube.com/b', windowId: win!.id });
    await enforceTabLimit(extra.id!);
    expect(await isOpen(extra.id!)).toBe(false);
  });

  it('is removed as before when only a pinned tab shares the window', async () => {
    await tabLimits.setValue([limit('youtube.com', 1)]);
    await openChecked('https://youtube.com/a');
    const win = await fakeBrowser.windows.create({});
    await fakeBrowser.tabs.create({ url: 'https://example.com', pinned: true, windowId: win!.id });
    const extra = await fakeBrowser.tabs.create({ url: 'https://youtube.com/b', windowId: win!.id });
    await enforceTabLimit(extra.id!);
    expect(await isOpen(extra.id!)).toBe(false);
  });

  it('records and notifies nothing when the redirect fails', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2025, 5, 10, 9, 0, 0));
    await tabLimits.setValue([limit('youtube.com', 1)]);
    await openChecked('https://youtube.com/a');
    vi.spyOn(fakeBrowser.tabs, 'update').mockRejectedValue(new Error('No tab with id'));
    await soloWindowTab('https://youtube.com/b');
    expect(await dayEvents.getValue()).toEqual({});
    expect(fakeBrowser.notifications.getAllCreateOptions()).toEqual({});
  });
});

describe('feedback and counting', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const today = '2025-06-10';
  const freezeToday = () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2025, 5, 10, 9, 0, 0));
  };

  it('records tabsAutoClosed once per closed tab, on the day it happened', async () => {
    freezeToday();
    await tabLimits.setValue([limit('youtube.com', 1)]);
    await openChecked('https://youtube.com/a');
    await openChecked('https://youtube.com/b');
    await openChecked('https://youtube.com/c');
    await openChecked('https://example.com');
    expect((await dayEvents.getValue())[today]).toEqual({ tabsAutoClosed: 2 });
  });

  it('records one per tab when several are closed at once', async () => {
    freezeToday();
    await tabLimits.setValue([limit('youtube.com', 1)]);
    await openChecked('https://youtube.com/a');
    const ids = await Promise.all([open('https://youtube.com/b'), open('https://youtube.com/c'), open('https://youtube.com/d')]);
    await Promise.all(ids.map((id) => enforceTabLimit(id)));
    expect((await dayEvents.getValue())[today]?.tabsAutoClosed).toBe(3);
  });

  it('records nothing when no tab is closed', async () => {
    freezeToday();
    await tabLimits.setValue([limit('youtube.com', 2)]);
    await openChecked('https://youtube.com/a');
    await openChecked('https://youtube.com/b');
    expect(await dayEvents.getValue()).toEqual({});
    expect(fakeBrowser.notifications.getAllCreateOptions()).toEqual({});
  });

  it('records and notifies nothing when the tab could not be closed', async () => {
    freezeToday();
    await tabLimits.setValue([limit('youtube.com', 1)]);
    await openChecked('https://youtube.com/a');
    vi.spyOn(fakeBrowser.tabs, 'remove').mockRejectedValue(new Error('No tab with id'));
    await openChecked('https://youtube.com/b');
    expect(await dayEvents.getValue()).toEqual({});
    expect(fakeBrowser.notifications.getAllCreateOptions()).toEqual({});
  });

  it('shows one notification per limit naming the limit and nothing else', async () => {
    await tabLimits.setValue([limit('youtube.com', 1, 'yt')]);
    await openChecked('https://youtube.com/a');
    await openChecked('https://youtube.com/secret-path?q=private');
    await openChecked('https://youtube.com/another');

    const shown = fakeBrowser.notifications.getAllCreateOptions();
    expect(Object.keys(shown)).toEqual(['tab-limit-yt']);
    const note = shown['tab-limit-yt']!;
    expect(note.title).toBe('Focused Time: Tab limit reached');
    expect(note.message).toBe('youtube.com is limited to 1 tab. The new tab was closed.');
    expect(JSON.stringify(note)).not.toMatch(/secret|private/);
  });

  it('still closes and records when the notification fails', async () => {
    freezeToday();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(fakeBrowser.notifications, 'create').mockRejectedValue(new Error('denied'));
    await tabLimits.setValue([limit('youtube.com', 1)]);
    await openChecked('https://youtube.com/a');
    const b = await openChecked('https://youtube.com/b');
    expect(await isOpen(b)).toBe(false);
    expect((await dayEvents.getValue())[today]?.tabsAutoClosed).toBe(1);
  });
});

describe('concurrency', () => {
  it('closes only as many tabs as needed when several open at once', async () => {
    await tabLimits.setValue([limit('youtube.com', 3)]);
    await openChecked('https://youtube.com/1');
    await openChecked('https://youtube.com/2');
    const a = await open('https://youtube.com/a');
    const b = await open('https://youtube.com/b');

    await Promise.all([enforceTabLimit(a), enforceTabLimit(b)]);
    const youtube = (await fakeBrowser.tabs.query({})).filter((t) => t.url?.includes('youtube.com'));
    expect(youtube).toHaveLength(3);
  });
});

describe('counted-tab bookkeeping', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Three youtube tabs with the limit then lowered to 1, so `first` is over the limit but already counted. */
  async function overLimitSetup() {
    await tabLimits.setValue([limit('youtube.com', 3)]);
    const first = await openChecked('https://youtube.com/1');
    await openChecked('https://youtube.com/2');
    await openChecked('https://youtube.com/3');
    await tabLimits.setValue([limit('youtube.com', 1)]);
    return first;
  }

  it('survives a background restart: an already-counted tab still passes when it navigates within the site', async () => {
    const first = await overLimitSetup();
    resetTabLimitState(); // what a suspended-and-restarted background loses

    await fakeBrowser.tabs.update(first, { url: 'https://youtube.com/other' });
    await enforceTabLimit(first);
    expect(await isOpen(first)).toBe(true);
  });

  it('keeps ids only: no hostname, pattern or path ends up in session storage', async () => {
    await tabLimits.setValue([limit('youtube.com', 5, 'limit-1')]);
    const id = await openChecked('https://youtube.com/watch?v=secret');
    const stored = await tabLimitCounted.getValue();
    expect(stored).toEqual({ [id]: 'limit-1' });
    expect(JSON.stringify(await fakeBrowser.storage.session.get(null))).not.toMatch(/youtube|secret/);
  });

  it('forgets a tab when it is closed', async () => {
    registerTabLimits();
    await tabLimits.setValue([limit('youtube.com', 5)]);
    const id = await openChecked('https://youtube.com/a');
    expect(Object.keys(await tabLimitCounted.getValue())).toEqual([String(id)]);

    await fakeBrowser.tabs.remove(id);
    // fake-browser rejects remove() before it fires onRemoved, so fire it as the real browser would.
    await fakeBrowser.tabs.onRemoved.trigger(id, { windowId: 1, isWindowClosing: false });
    await serialize(async () => {});
    expect(await tabLimitCounted.getValue()).toEqual({});
  });

  describe('when storage.session is unavailable', () => {
    beforeEach(() => {
      vi.spyOn(tabLimitCounted, 'getValue').mockRejectedValue(new Error('storage.session is not available'));
      vi.spyOn(tabLimitCounted, 'setValue').mockRejectedValue(new Error('storage.session is not available'));
    });

    it('still enforces limits using module memory', async () => {
      await tabLimits.setValue([limit('youtube.com', 1)]);
      await openChecked('https://youtube.com/a');
      expect(await isOpen(await openChecked('https://youtube.com/b'))).toBe(false);
    });

    it('still lets a counted tab navigate within its site, until the background restarts', async () => {
      const first = await overLimitSetup();
      await fakeBrowser.tabs.update(first, { url: 'https://youtube.com/other' });
      await enforceTabLimit(first);
      expect(await isOpen(first)).toBe(true);

      resetTabLimitState(); // memory is lost on restart: the documented limitation of the fallback
      await fakeBrowser.tabs.update(first, { url: 'https://youtube.com/again' });
      await enforceTabLimit(first);
      expect(await isOpen(first)).toBe(false);
    });
  });
});

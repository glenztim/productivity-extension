import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { TAB_LIMIT_GRACE_MS, enforceTabLimit, resetTabLimitState, startTabLimitGrace } from './tabLimits';
import { tabLimits, type TabLimitEntry } from './storage';

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

beforeEach(() => {
  fakeBrowser.reset();
  resetTabLimitState();
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

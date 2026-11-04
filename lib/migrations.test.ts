import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { CURRENT_SCHEMA_VERSION, MIGRATIONS, runMigrations, type Migration } from './migrations';
import { blocklist, schemaVersion, settings } from './storage';
import { serialize } from './mutex';

beforeEach(() => {
  fakeBrowser.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** A migration that records when it ran, so order can be asserted. */
function recorder(log: number[], to: number, run?: () => Promise<void>): Migration {
  return {
    to,
    run: async () => {
      log.push(to);
      await run?.();
    },
  };
}

describe('the real migration list', () => {
  it('starts at schema version 1', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
  });

  it('is consistent: ascending, one per version above 1, ending at the current version', () => {
    const versions = MIGRATIONS.map((m) => m.to);
    expect(versions).toEqual(Array.from({ length: CURRENT_SCHEMA_VERSION - 1 }, (_, i) => i + 2));
  });
});

describe('runMigrations', () => {
  it('stamps version 1 on a fresh install', async () => {
    expect(await runMigrations()).toEqual({ status: 'initialized', version: 1 });
    expect(await schemaVersion.getValue()).toBe(1);
  });

  it('stamps existing unversioned data without changing it', async () => {
    await blocklist.setValue([{ id: 'a', pattern: 'reddit.com', addedAt: 1 }]);
    await settings.setValue({ ...(await settings.getValue()), shortSessionMinutes: 77 });

    expect(await runMigrations()).toEqual({ status: 'initialized', version: 1 });
    expect(await blocklist.getValue()).toEqual([{ id: 'a', pattern: 'reddit.com', addedAt: 1 }]);
    expect((await settings.getValue()).shortSessionMinutes).toBe(77);
  });

  it('does nothing when already at the current version', async () => {
    await schemaVersion.setValue(1);
    expect(await runMigrations()).toEqual({ status: 'up-to-date', version: 1 });
    expect(await schemaVersion.getValue()).toBe(1);
  });

  it('runs pending migrations in order from the stored version and stamps the result', async () => {
    const log: number[] = [];
    await schemaVersion.setValue(1);
    const result = await runMigrations([recorder(log, 3), recorder(log, 2), recorder(log, 4)], 4);
    expect(log).toEqual([2, 3, 4]);
    expect(result).toEqual({ status: 'migrated', version: 4 });
    expect(await schemaVersion.getValue()).toBe(4);
  });

  it('skips migrations at or below the stored version', async () => {
    const log: number[] = [];
    await schemaVersion.setValue(3);
    await runMigrations([recorder(log, 2), recorder(log, 3), recorder(log, 4)], 4);
    expect(log).toEqual([4]);
  });

  it('does not run migrations above the target version', async () => {
    const log: number[] = [];
    await schemaVersion.setValue(1);
    await runMigrations([recorder(log, 2), recorder(log, 3)], 2);
    expect(log).toEqual([2]);
    expect(await schemaVersion.getValue()).toBe(2);
  });

  it('runs a migration against the data and the next start does not repeat it', async () => {
    await schemaVersion.setValue(1);
    await blocklist.setValue([{ id: 'a', pattern: 'Reddit.com', addedAt: 1 }]);
    const lowercase: Migration = {
      to: 2,
      run: async () => blocklist.setValue((await blocklist.getValue()).map((e) => ({ ...e, pattern: e.pattern.toLowerCase() }))),
    };
    await runMigrations([lowercase], 2);
    expect((await blocklist.getValue())[0]!.pattern).toBe('reddit.com');

    const again = vi.fn(async () => {});
    expect(await runMigrations([{ to: 2, run: again }], 2)).toEqual({ status: 'up-to-date', version: 2 });
    expect(again).not.toHaveBeenCalled();
  });

  it('stops at a failing migration, keeps the last good version, and retries from there next time', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const log: number[] = [];
    await schemaVersion.setValue(1);
    let broken = true;
    const migrations = [
      recorder(log, 2),
      recorder(log, 3, async () => {
        if (broken) throw new Error('boom');
      }),
      recorder(log, 4),
    ];

    expect(await runMigrations(migrations, 4)).toEqual({ status: 'failed', version: 2 });
    expect(log).toEqual([2, 3]);
    expect(await schemaVersion.getValue()).toBe(2);

    broken = false;
    expect(await runMigrations(migrations, 4)).toEqual({ status: 'migrated', version: 4 });
    expect(log).toEqual([2, 3, 3, 4]);
  });

  it('leaves data written by a newer version alone and does not lower the version', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log: number[] = [];
    await schemaVersion.setValue(7);
    expect(await runMigrations([recorder(log, 2)], 2)).toEqual({ status: 'newer-than-supported', version: 7 });
    expect(log).toEqual([]);
    expect(await schemaVersion.getValue()).toBe(7);
  });

  it.each([-1, 1.5, '1', true])('leaves storage alone when the stored version is %j', async (bad) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const log: number[] = [];
    await fakeBrowser.storage.local.set({ schemaVersion: bad });
    expect(await runMigrations([recorder(log, 2)], 2)).toEqual({ status: 'invalid-version', version: null });
    expect(log).toEqual([]);
  });

  it('treats a stored null like a missing version (WXT reads it as the fallback)', async () => {
    await fakeBrowser.storage.local.set({ schemaVersion: null });
    expect(await runMigrations()).toEqual({ status: 'initialized', version: 1 });
  });

  it('never rejects, even when storage itself fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(schemaVersion, 'getValue').mockRejectedValue(new Error('storage unavailable'));
    await expect(runMigrations()).resolves.toEqual({ status: 'failed', version: null });
  });

  it('holds the accounting lock, so work queued after it sees migrated data', async () => {
    await schemaVersion.setValue(1);
    const order: string[] = [];
    const slow: Migration = {
      to: 2,
      run: async () => {
        await new Promise((r) => setTimeout(r, 10));
        order.push('migration');
      },
    };
    const migrating = runMigrations([slow], 2);
    const after = serialize(async () => order.push('later work'));
    await Promise.all([migrating, after]);
    expect(order).toEqual(['migration', 'later work']);
  });
});

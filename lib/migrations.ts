import { schemaVersion } from './storage';
import { serialize } from './mutex';
import { logError } from './logError';

/**
 * Storage schema versioning. `local:schemaVersion` records which shape the data on disk has, and
 * `runMigrations` (run when the background starts) upgrades it step by step.
 *
 * To change the shape of stored data: bump CURRENT_SCHEMA_VERSION and append a migration with
 * `to` set to the new number. Rules for a migration:
 *  - it takes the data from version `to - 1` to version `to`, and nothing else;
 *  - it must be idempotent, because a crash can make it run again;
 *  - it may only touch `local:` items, and only through the typed items in ./storage.
 * Purely additive changes (a new optional field, a new counter name) do not need a migration.
 */
export const CURRENT_SCHEMA_VERSION = 1;

export interface Migration {
  /** The version the data has after this migration ran. */
  to: number;
  run(): Promise<void>;
}

/** Ordered by `to`, one entry per version above 1. Version 1 is the shape that existed when versioning was introduced. */
export const MIGRATIONS: readonly Migration[] = [];

export type MigrationStatus =
  /** Already at the target version; nothing to do. */
  | 'up-to-date'
  /** No version was stored: stamped with the target (fresh install, or data that predates versioning). */
  | 'initialized'
  /** One or more migrations ran. */
  | 'migrated'
  /** The data was written by a newer version of the extension. It is left untouched. */
  | 'newer-than-supported'
  /** The stored version is not a non-negative integer. The data is left untouched. */
  | 'invalid-version'
  /** A migration threw. The version stays at the last step that completed. */
  | 'failed';

export interface MigrationResult {
  status: MigrationStatus;
  /** The version stored after this run (null when it could not be read as a number). */
  version: number | null;
}

async function migrate(migrations: readonly Migration[], target: number): Promise<MigrationResult> {
  const raw: unknown = await schemaVersion.getValue();
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) {
    console.error('Stored schema version is not a valid version; leaving storage untouched');
    return { status: 'invalid-version', version: null };
  }

  if (raw === 0) {
    // Fresh install, or data from before versioning: both already have the version-1 shape.
    const start = Math.min(1, target);
    await schemaVersion.setValue(start);
    const rest = await migrateFrom(start, migrations, target);
    return rest.status === 'up-to-date' ? { status: 'initialized', version: start } : rest;
  }
  if (raw > target) {
    console.warn(`Storage was written by a newer version (schema ${raw}, this build supports ${target}); leaving it untouched`);
    return { status: 'newer-than-supported', version: raw };
  }
  return migrateFrom(raw, migrations, target);
}

async function migrateFrom(from: number, migrations: readonly Migration[], target: number): Promise<MigrationResult> {
  let version = from;
  let ran = false;
  const pending = migrations.filter((m) => m.to > from && m.to <= target).sort((a, b) => a.to - b.to);

  for (const m of pending) {
    try {
      await m.run();
    } catch (err) {
      // Version stays at the last completed step, so the next start retries from here.
      logError(`Storage migration to schema ${m.to} failed`, err);
      return { status: 'failed', version };
    }
    version = m.to;
    await schemaVersion.setValue(version); // stamp after every step, so a crash resumes instead of repeating
    ran = true;
  }

  if (version < target) {
    await schemaVersion.setValue(target); // no data change between the last migration and the target
    version = target;
  }
  return { status: ran ? 'migrated' : 'up-to-date', version };
}

/**
 * Brings storage up to CURRENT_SCHEMA_VERSION. Runs under the accounting lock, so anything that
 * serializes storage work after it starts sees migrated data. Never rejects.
 */
export function runMigrations(migrations: readonly Migration[] = MIGRATIONS, target: number = CURRENT_SCHEMA_VERSION): Promise<MigrationResult> {
  return serialize(() => migrate(migrations, target)).catch((err) => {
    logError('Storage migration check failed', err);
    return { status: 'failed' as const, version: null };
  });
}

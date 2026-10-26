import { describe, expect, it } from 'vitest';
import { serialize } from './mutex';

describe('serialize', () => {
  it('runs queued tasks one at a time, in order', async () => {
    const log: string[] = [];
    const task = (name: string, ms: number) => async () => {
      log.push(`${name}:start`);
      await new Promise((r) => setTimeout(r, ms));
      log.push(`${name}:end`);
    };
    await Promise.all([serialize(task('a', 20)), serialize(task('b', 1)), serialize(task('c', 1))]);
    expect(log).toEqual(['a:start', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end']);
  });

  it('keeps the queue alive after a task throws', async () => {
    await expect(serialize(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    await expect(serialize(async () => 42)).resolves.toBe(42);
  });
});

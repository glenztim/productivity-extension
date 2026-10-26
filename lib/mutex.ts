let tail: Promise<unknown> = Promise.resolve();

/** Runs `fn` after every previously queued call has settled, so storage read-modify-writes never interleave. */
export function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(fn, fn);
  tail = run.catch(() => {});
  return run;
}

import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorName, logError, logWarn } from './logError';

const SECRET_URL = 'https://old.reddit.com/r/secret-subreddit/comments/abc123?token=hunter2';

afterEach(() => {
  vi.restoreAllMocks();
});

/** Everything the spy was called with, flattened to one string. */
function output(spy: { mock: { calls: unknown[][] } }): string {
  return spy.mock.calls.map((args) => args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')).join('\n');
}

describe('errorName', () => {
  it('returns the name of an error', () => {
    expect(errorName(new TypeError('x'))).toBe('TypeError');
    expect(errorName(new Error('x'))).toBe('Error');
    expect(errorName(new DOMException('x', 'QuotaExceededError'))).toBe('QuotaExceededError');
  });

  it('works for errors from another realm, which fail instanceof', () => {
    expect(errorName({ name: 'TypeError', message: 'x' })).toBe('TypeError');
  });

  it('never returns a string thrown as a value', () => {
    expect(errorName(SECRET_URL)).toBe('NonError');
    expect(errorName(42)).toBe('NonError');
    expect(errorName(null)).toBe('NonError');
    expect(errorName(undefined)).toBe('NonError');
  });

  it('does not trust a name that is not an identifier', () => {
    expect(errorName({ name: SECRET_URL })).toBe('UnknownError');
    expect(errorName(Object.assign(new Error('x'), { name: 'Failed for reddit.com' }))).toBe('UnknownError');
    expect(errorName({ name: 'A'.repeat(200) })).toBe('UnknownError');
    expect(errorName({ name: 5 })).toBe('UnknownError');
    expect(errorName({})).toBe('UnknownError');
  });

  it('survives a name getter that throws', () => {
    const hostile = {
      get name(): string {
        throw new Error(SECRET_URL);
      },
    };
    expect(errorName(hostile)).toBe('UnknownError');
  });
});

describe('logError / logWarn', () => {
  it('logs the context and the error name as one string', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logError('Failed to record goalReached', new RangeError('boom'));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('Failed to record goalReached (RangeError)');
  });

  it('never outputs the message, the stack, the cause or extra properties', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = Object.assign(new TypeError(`Invalid URL: ${SECRET_URL}`), {
      cause: new Error(SECRET_URL),
      url: SECRET_URL,
    });
    logError('Something failed', err);

    const out = output(spy);
    expect(out).toBe('Something failed (TypeError)');
    expect(out).not.toMatch(/reddit|secret|abc123|hunter2|https?:|Invalid URL|\bat \w/i);
    expect(spy.mock.calls[0]).toHaveLength(1);
  });

  it('never outputs a thrown string or object', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logError('A', SECRET_URL);
    logError('B', { message: SECRET_URL, stack: SECRET_URL });
    expect(output(spy)).toBe('A (NonError)\nB (UnknownError)');
  });

  it('warns the same way', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logWarn('Could not start the grace period', new Error(SECRET_URL));
    expect(spy).toHaveBeenCalledWith('Could not start the grace period (Error)');
  });
});

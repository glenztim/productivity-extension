/**
 * Privacy-safe error logging. Error messages, stacks and thrown values can carry what the user was
 * doing (a failed `new URL(...)` quotes the URL, a failed tab call can quote a tab's address), and
 * CLAUDE.md forbids logging visited URLs or hostnames. So these helpers log a fixed context string
 * and the error's *name* (TypeError, QuotaExceededError, ...) and nothing else: never the message,
 * the stack, the cause or the raw object.
 *
 * `context` must be a fixed description of what failed. Do not put page data into it.
 */

/** Real error names are short identifiers. Anything that does not look like one is not trusted. */
const SAFE_ERROR_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/** The error's name if it has a plain identifier-like one, otherwise a generic placeholder. Never throws. */
export function errorName(err: unknown): string {
  // A thrown string or number could be anything, including a URL, so only objects are looked at.
  if (typeof err !== 'object' || err === null) return 'NonError';
  try {
    const name: unknown = (err as { name?: unknown }).name;
    if (typeof name === 'string' && SAFE_ERROR_NAME.test(name)) return name;
  } catch {
    // A throwing `name` getter: fall through to the placeholder.
  }
  return 'UnknownError';
}

/** `console.error` with the context and the error's name only. */
export function logError(context: string, err: unknown): void {
  console.error(`${context} (${errorName(err)})`);
}

/** `console.warn` with the context and the error's name only. */
export function logWarn(context: string, err: unknown): void {
  console.warn(`${context} (${errorName(err)})`);
}

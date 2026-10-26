import { blocklist, productivityList, type Category, type SiteEntry } from './storage';

export function safeHostname(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

/** Normalizes free-form user input (e.g. "https://www.Reddit.com/r/foo") down to a bare hostname pattern. */
export function normalizePattern(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const candidate = trimmed.includes('://') ? trimmed : `http://${trimmed}`;
  const hostname = safeHostname(candidate);
  return hostname;
}

function matchesPattern(hostname: string, pattern: string): boolean {
  return hostname === pattern || hostname.endsWith('.' + pattern);
}

export async function categorize(hostname: string): Promise<Category> {
  const [bad, good] = await Promise.all([blocklist.getValue(), productivityList.getValue()]);
  if (bad.some((e: SiteEntry) => matchesPattern(hostname, e.pattern))) return 'bad';
  if (good.some((e: SiteEntry) => matchesPattern(hostname, e.pattern))) return 'good';
  return 'neutral';
}

import type { Checkpoint, Mode, Settings } from './storage';
import { getRatio } from './ratios';

/**
 * Client-side-only interpolation for a live-ticking display: extrapolates the authoritative
 * stored pool balance forward using time elapsed since the background's last checkpoint. Purely
 * cosmetic — never written back to storage; the background's own checkpoint/flush accounting
 * remains the single source of truth and resyncs this on the next real event.
 */
export function interpolatePool(baseSeconds: number, mode: Mode, cp: Checkpoint, settings: Settings, now: number): number {
  if (cp.category === 'none') return baseSeconds;
  const elapsedSec = Math.max(0, (now - cp.timestamp) / 1000);
  if (elapsedSec === 0) return baseSeconds;

  const ratio = getRatio(settings);
  const perGoodSecond = ratio.goodMinutes > 0 ? ratio.poolMinutes / ratio.goodMinutes : 0;

  if (mode.type === 'session') {
    if (cp.category === 'good') return baseSeconds + elapsedSec * perGoodSecond;
    if (cp.category === 'bad') return Math.max(0, baseSeconds - elapsedSec);
    return baseSeconds;
  }
  if (mode.type === 'hardBlock') {
    return baseSeconds + elapsedSec * perGoodSecond;
  }
  return baseSeconds;
}

/** Same idea for today's good-time stat, which accrues regardless of session/hard-block mode. */
export function interpolateGoodSecondsToday(baseSeconds: number, cp: Checkpoint, now: number): number {
  if (cp.category !== 'good') return baseSeconds;
  const elapsedSec = Math.max(0, (now - cp.timestamp) / 1000);
  return baseSeconds + elapsedSec;
}

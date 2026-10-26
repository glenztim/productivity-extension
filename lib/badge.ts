import { activeMode, poolBalanceSeconds, checkpoint } from './storage';

const DANGER_THRESHOLD_SECONDS = 60;
const DANGER_COLOR = '#e34948';
const NORMAL_COLOR = '#3b3f47';

let liveTickHandle: ReturnType<typeof setInterval> | null = null;

function formatBadgeText(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < DANGER_THRESHOLD_SECONDS) return String(s);
  const totalMinutes = Math.floor(s / 60);
  if (totalMinutes < 100) return `${totalMinutes}m`;
  return `${Math.floor(totalMinutes / 60)}h`;
}

async function paintBadge(seconds: number): Promise<void> {
  const danger = seconds < DANGER_THRESHOLD_SECONDS;
  await browser.action.setBadgeText({ text: formatBadgeText(seconds) });
  await browser.action.setBadgeBackgroundColor({ color: danger ? DANGER_COLOR : NORMAL_COLOR });
  await browser.action.setBadgeTextColor?.({ color: '#ffffff' });
}

function stopLiveTick(): void {
  if (liveTickHandle !== null) {
    clearInterval(liveTickHandle);
    liveTickHandle = null;
  }
}

/**
 * Repaints the toolbar badge from the authoritative stored pool balance, and — only while
 * actively draining the pool on a blocklisted site with under a minute left — starts a
 * bounded (<=60s) per-second cosmetic tick so the countdown visibly moves. This never writes
 * to storage; it's purely a display animation. If the background gets suspended mid-countdown,
 * the badge just stops animating until the next real event (tab switch, alarm) resyncs it.
 */
export async function updateBadge(): Promise<void> {
  stopLiveTick();

  const [pool, mode, cp] = await Promise.all([poolBalanceSeconds.getValue(), activeMode.getValue(), checkpoint.getValue()]);
  await paintBadge(pool);

  const isActivelyDraining = mode.type === 'session' && cp.category === 'bad' && pool > 0 && pool < DANGER_THRESHOLD_SECONDS;
  if (!isActivelyDraining) return;

  let remaining = pool;
  liveTickHandle = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      stopLiveTick();
      paintBadge(0);
      return;
    }
    paintBadge(remaining);
  }, 1000);
}

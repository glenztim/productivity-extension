import { settings, type RatioMode } from './storage';

export const PRESETS: Record<Exclude<RatioMode, 'custom'>, { goodMinutes: number; poolMinutes: number; label: string }> = {
  strict: { goodMinutes: 10, poolMinutes: 1, label: 'Strict (10 min good : 1 min pool)' },
  balanced: { goodMinutes: 5, poolMinutes: 1, label: 'Balanced / Pomodoro (5 min good : 1 min pool)' },
  generous: { goodMinutes: 3, poolMinutes: 1, label: 'Generous (3 min good : 1 min pool)' },
};

export function getRatio(s: { ratioMode: RatioMode; customRatio: { goodMinutes: number; poolMinutes: number } }) {
  if (s.ratioMode === 'custom') return s.customRatio;
  return PRESETS[s.ratioMode];
}

/** How many seconds of pool are earned per second spent on a good site. */
export async function poolPerGoodSecond(): Promise<number> {
  const s = await settings.getValue();
  const ratio = getRatio(s);
  if (ratio.goodMinutes <= 0) return 0;
  return ratio.poolMinutes / ratio.goodMinutes;
}

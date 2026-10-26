import { useMemo } from 'react';
import { dailyStats, hourlyStats } from './storage';
import type { StatsSource } from './dayStats';
import { useStorageItem } from './useStorageItem';
import { USE_MOCK_DATA, generateMockStats } from './mockData';

/** Stats for the UI: real storage by default, generated sample data when USE_MOCK_DATA is on. Read via lib/dayStats selectors. */
export function useDailyStats(): StatsSource | undefined {
  const hourly = useStorageItem(hourlyStats);
  const legacy = useStorageItem(dailyStats);
  const mock = useMemo(() => (USE_MOCK_DATA ? generateMockStats() : undefined), []);
  const real = useMemo(() => (hourly && legacy ? { hourly, legacy } : undefined), [hourly, legacy]);
  return USE_MOCK_DATA ? mock : real;
}

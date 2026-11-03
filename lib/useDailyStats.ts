import { useMemo } from 'react';
import { dailyStats, dayEvents, hourlyStats } from './storage';
import type { StatsSource } from './dayStats';
import { useStorageItem } from './useStorageItem';
import { USE_MOCK_DATA, generateMockStats } from './mockData';

/** Stats for the UI: real storage by default, generated sample data when USE_MOCK_DATA is on. Read via lib/dayStats selectors. */
export function useDailyStats(): StatsSource | undefined {
  const hourly = useStorageItem(hourlyStats);
  const legacy = useStorageItem(dailyStats);
  const events = useStorageItem(dayEvents);
  const mock = useMemo(() => (USE_MOCK_DATA ? generateMockStats() : undefined), []);
  const real = useMemo(() => (hourly && legacy && events ? { hourly, legacy, events } : undefined), [hourly, legacy, events]);
  return USE_MOCK_DATA ? mock : real;
}

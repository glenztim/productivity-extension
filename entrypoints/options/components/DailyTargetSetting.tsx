import { settings, DEFAULT_DAILY_TARGET_MINUTES } from '@/lib/storage';
import { useStorageItem } from '@/lib/useStorageItem';

export default function DailyTargetSetting() {
  const config = useStorageItem(settings);
  if (!config) return null;

  return (
    <div className="field-row">
      <label htmlFor="daily-target">Good-time target per day (minutes)</label>
      <input
        id="daily-target"
        type="number"
        min={1}
        value={config.dailyGoodTargetMinutes ?? DEFAULT_DAILY_TARGET_MINUTES}
        onChange={(e) => settings.setValue({ ...config, dailyGoodTargetMinutes: Number(e.target.value) })}
      />
    </div>
  );
}

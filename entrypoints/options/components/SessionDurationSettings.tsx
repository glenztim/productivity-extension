import { settings } from '@/lib/storage';
import { useStorageItem } from '@/lib/useStorageItem';

export default function SessionDurationSettings() {
  const config = useStorageItem(settings);
  if (!config) return null;

  const update = (patch: Partial<typeof config>) => settings.setValue({ ...config, ...patch });

  return (
    <div>
      <div className="field-row">
        <label htmlFor="short-minutes">Short session length (minutes)</label>
        <input
          id="short-minutes"
          type="number"
          min={1}
          value={config.shortSessionMinutes}
          onChange={(e) => update({ shortSessionMinutes: Number(e.target.value) })}
        />
      </div>
      <div className="field-row">
        <label htmlFor="long-minutes">Long session default length (minutes)</label>
        <input
          id="long-minutes"
          type="number"
          min={1}
          value={config.longSessionMinutesDefault}
          onChange={(e) => update({ longSessionMinutesDefault: Number(e.target.value) })}
        />
      </div>
      <div className="field-row">
        <label htmlFor="hard-minutes">Hard block default length (minutes)</label>
        <input
          id="hard-minutes"
          type="number"
          min={1}
          value={config.hardBlockMinutesDefault}
          onChange={(e) => update({ hardBlockMinutesDefault: Number(e.target.value) })}
        />
      </div>
    </div>
  );
}

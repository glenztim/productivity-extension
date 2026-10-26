import { settings, type RatioMode } from '@/lib/storage';
import { useStorageItem } from '@/lib/useStorageItem';
import { PRESETS } from '@/lib/ratios';

const MODES: RatioMode[] = ['strict', 'balanced', 'generous', 'custom'];

export default function RatioPicker() {
  const config = useStorageItem(settings);
  if (!config) return null;

  const setMode = (ratioMode: RatioMode) => settings.setValue({ ...config, ratioMode });
  const setCustom = (patch: Partial<typeof config.customRatio>) =>
    settings.setValue({ ...config, customRatio: { ...config.customRatio, ...patch } });

  return (
    <div className="ratio-picker">
      {MODES.map((mode) => (
        <label key={mode} className="radio-row">
          <input type="radio" name="ratio-mode" checked={config.ratioMode === mode} onChange={() => setMode(mode)} />
          {mode === 'custom' ? (
            <span>
              Custom:
              <input
                type="number"
                min={1}
                value={config.customRatio.goodMinutes}
                onChange={(e) => setCustom({ goodMinutes: Number(e.target.value) })}
              />
              min good sites :
              <input
                type="number"
                min={1}
                value={config.customRatio.poolMinutes}
                onChange={(e) => setCustom({ poolMinutes: Number(e.target.value) })}
              />
              min pool
            </span>
          ) : (
            <span>{PRESETS[mode].label}</span>
          )}
        </label>
      ))}
    </div>
  );
}

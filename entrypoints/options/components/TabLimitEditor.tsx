import { useState } from 'react';
import { tabLimits } from '@/lib/storage';
import { useStorageItem } from '@/lib/useStorageItem';
import { normalizePattern } from '@/lib/categorize';
import './SiteListEditor.css';

export default function TabLimitEditor() {
  const entries = useStorageItem(tabLimits);
  const [input, setInput] = useState('');
  const [max, setMax] = useState('3');
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    const pattern = normalizePattern(input);
    if (!pattern) {
      setError('Enter a valid site, e.g. youtube.com');
      return;
    }
    const maxTabs = Math.floor(Number(max));
    if (!Number.isFinite(maxTabs) || maxTabs < 1) {
      setError('Tab limit must be at least 1');
      return;
    }
    const current = entries ?? [];
    if (current.some((e) => e.pattern === pattern)) {
      setError(`${pattern} already has a limit`);
      return;
    }
    await tabLimits.setValue([...current, { id: crypto.randomUUID(), pattern, maxTabs }]);
    setInput('');
    setError(null);
  };

  const update = async (id: string, maxTabs: number) => {
    if (!Number.isFinite(maxTabs) || maxTabs < 1) return;
    await tabLimits.setValue((entries ?? []).map((e) => (e.id === id ? { ...e, maxTabs: Math.floor(maxTabs) } : e)));
  };

  const remove = async (id: string) => {
    await tabLimits.setValue((entries ?? []).filter((e) => e.id !== id));
  };

  return (
    <div className="site-list-editor">
      <p className="muted">Once a site has this many tabs open, any further tab opened on it is closed automatically. Pinned tabs are neither counted nor closed.</p>

      <div className="add-row">
        <input
          type="text"
          placeholder="example.com"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <input
          type="number"
          min={1}
          style={{ flex: '0 0 5em' }}
          aria-label="Maximum tabs"
          value={max}
          onChange={(e) => setMax(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button onClick={add}>Add</button>
      </div>
      {error && <p className="error">{error}</p>}

      <ul className="site-list">
        {(entries ?? []).map((e) => (
          <li key={e.id}>
            <span>{e.pattern}</span>
            <span>
              max{' '}
              <input
                type="number"
                min={1}
                style={{ width: '4.5em' }}
                aria-label={`Maximum tabs for ${e.pattern}`}
                defaultValue={e.maxTabs}
                onBlur={(ev) => update(e.id, Number(ev.target.value))}
              />{' '}
              <button className="link" onClick={() => remove(e.id)}>
                Remove
              </button>
            </span>
          </li>
        ))}
        {entries?.length === 0 && <li className="muted empty">No tab limits yet.</li>}
      </ul>
    </div>
  );
}

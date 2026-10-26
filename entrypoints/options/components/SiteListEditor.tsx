import { useState } from 'react';
import type { SiteEntry } from '@/lib/storage';
import { useStorageItem, type StorageItemLike } from '@/lib/useStorageItem';
import { normalizePattern } from '@/lib/categorize';
import './SiteListEditor.css';

export default function SiteListEditor({
  title,
  description,
  item,
}: {
  title: string;
  description: string;
  item: StorageItemLike<SiteEntry[]>;
}) {
  const entries = useStorageItem(item);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    const pattern = normalizePattern(input);
    if (!pattern) {
      setError('Enter a valid site, e.g. reddit.com');
      return;
    }
    const current = entries ?? [];
    if (current.some((e) => e.pattern === pattern)) {
      setError(`${pattern} is already on the list`);
      return;
    }
    await item.setValue([...current, { id: crypto.randomUUID(), pattern, addedAt: Date.now() }]);
    setInput('');
    setError(null);
  };

  const remove = async (id: string) => {
    await item.setValue((entries ?? []).filter((e) => e.id !== id));
  };

  return (
    <div className="site-list-editor">
      <h3>{title}</h3>
      <p className="muted">{description}</p>

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
        <button onClick={add}>Add</button>
      </div>
      {error && <p className="error">{error}</p>}

      <ul className="site-list">
        {(entries ?? []).map((e) => (
          <li key={e.id}>
            <span>{e.pattern}</span>
            <button className="link" onClick={() => remove(e.id)}>
              Remove
            </button>
          </li>
        ))}
        {entries?.length === 0 && <li className="muted empty">No sites added yet.</li>}
      </ul>
    </div>
  );
}

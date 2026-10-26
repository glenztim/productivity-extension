import { useEffect, useState } from 'react';

export interface WatchableItem<T> {
  getValue(): Promise<T>;
  watch(cb: (newValue: T) => void): () => void;
}

export interface StorageItemLike<T> extends WatchableItem<T> {
  setValue(value: T): Promise<void>;
}

/** Subscribes a component to a WXT storage item, re-rendering whenever the background writes a new value. */
export function useStorageItem<T>(item: WatchableItem<T>): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    item.getValue().then((v) => {
      if (!cancelled) setValue(v);
    });
    const unwatch = item.watch((v) => setValue(v));
    return () => {
      cancelled = true;
      unwatch();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  return value;
}

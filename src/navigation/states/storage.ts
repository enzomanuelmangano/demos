import Storage from 'expo-sqlite/kv-store';
import { atomWithStorage, createJSONStorage } from 'jotai/utils';

const storage = Storage;

function getItem(key: string): string | null {
  const value = storage.getItemSync(key);
  return value ? value : null;
}

function setItem(key: string, value: string): void {
  storage.setItemSync(key, value);
}

function removeItem(key: string): void {
  storage.removeItemSync(key);
}

function clearAll(): void {
  storage.clearSync();
}

export const atomWithKVStorage = <T>(key: string, initialValue: T) =>
  atomWithStorage<T>(
    key,
    initialValue,
    createJSONStorage<T>(() => ({
      getItem,
      setItem,
      removeItem,
      clearAll,
    })),
    { getOnInit: true },
  );

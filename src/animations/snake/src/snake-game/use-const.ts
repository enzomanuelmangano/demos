import { useRef } from 'react';

export function useConst<T>(initializer: () => T): T {
  const ref = useRef<T | undefined>(undefined);

  if (ref.current === undefined) {
    ref.current = initializer();
  }

  return ref.current;
}

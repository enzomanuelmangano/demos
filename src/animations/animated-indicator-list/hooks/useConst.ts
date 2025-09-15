import { useRef } from 'react';

function useConst<T>(initialValue: T | (() => T)): T {
  const ref = useRef<{ value: T }>(undefined);
  if (ref.current === undefined) {
    // Box the value in an object so we can tell if it's initialized even if the initializer
    // returns/is undefined
    ref.current = {
      value:
        typeof initialValue === 'function'
          ? (initialValue as Function)()
          : initialValue,
    };
  }
  return ref.current.value;
}

export { useConst };

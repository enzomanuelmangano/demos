import { useEffect } from 'react';

import { useSharedValue } from 'react-native-reanimated';

import { useTimeout } from './useTimeout';

// That's not a real "useMounted" hook.
// It's the equivalent version but instead of using a React state, it uses a Reanimated shared value.
const useMounted = () => {
  const mounted = useSharedValue(false);
  const runTimeout = useTimeout();

  useEffect(() => {
    runTimeout(() => {
      mounted.value = true;
    }, 100);

    return () => {
      mounted.value = false;
    };
  }, [mounted, runTimeout]);
  return mounted;
};

export { useMounted };

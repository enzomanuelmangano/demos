import { DevSettings, Platform } from 'react-native';

import { useEffect, useMemo, useRef } from 'react';

import { Accelerometer } from 'expo-sensors';
import debounce from 'lodash.debounce';

export const useOnShakeEffect = (callback: () => void) => {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const debouncedCallback = useMemo(
    () =>
      debounce(() => callbackRef.current(), 500, {
        leading: true,
        trailing: false,
      }),
    [],
  );

  useEffect(() => {
    if (__DEV__ && Platform.OS !== 'web') {
      return DevSettings.addMenuItem('💬 Send Feedback', () =>
        callbackRef.current(),
      );
    }

    let lastUpdate = 0;
    let lastX = 0;
    let lastY = 0;
    let lastZ = 0;
    const shakeThreshold = 250;

    const subscription = Accelerometer.addListener(({ x, y, z }) => {
      const currentTime = new Date().getTime();
      if (currentTime - lastUpdate > 100) {
        const diffTime = currentTime - lastUpdate;
        lastUpdate = currentTime;

        const speed =
          ((Math.abs(x - lastX) + Math.abs(y - lastY) + Math.abs(z - lastZ)) /
            diffTime) *
          10000;

        if (speed > shakeThreshold) {
          console.log({ speed, shakeThreshold });
          debouncedCallback();
        }

        lastX = x;
        lastY = y;
        lastZ = z;
      }
    });

    return () => {
      subscription.remove();
    };
  }, [debouncedCallback]);
};

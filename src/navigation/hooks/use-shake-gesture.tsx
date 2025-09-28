import { useEffect, useMemo } from 'react';

import { Accelerometer } from 'expo-sensors';
import debounce from 'lodash.debounce';

export const useOnShakeEffect = (callback: () => void) => {
  const debouncedCallback = useMemo(
    () => debounce(callback, 2500, { leading: true, trailing: false }),
    [callback],
  );
  useEffect(() => {
    let lastUpdate = 0;
    let lastX = 0;
    let lastY = 0;
    let lastZ = 0;
    const shakeThreshold = 400;

    const subscription = Accelerometer.addListener(({ x, y, z }) => {
      const currentTime = new Date().getTime();
      if (currentTime - lastUpdate > 100) {
        const diffTime = currentTime - lastUpdate;
        lastUpdate = currentTime;

        const speed =
          (Math.abs(x + y + z - lastX - lastY - lastZ) / diffTime) * 10000;

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

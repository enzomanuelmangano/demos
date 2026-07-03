import { useCallback } from 'react';

import { SpringboardNative } from '../src/navigation/home/native-spike/springboard-native';
import { useOnShakeEffect } from '../src/navigation/hooks/use-shake-gesture';
import { useRetray } from '../src/packages/retray';

import type { Trays } from '../src/trays';

// SPIKE: home renders the native-zoom springboard variant. Demos are plain
// expo-router routes (/animations/[slug]) again — no standalone navigation
// tree — so Link.AppleZoom can drive the iOS 18 native zoom transition through
// the router's own native stack. Shake still opens the feedback tray.
export default function HomeScreen() {
  const { show } = useRetray<Trays>();
  const handleFeedback = useCallback(() => {
    show('help');
  }, [show]);

  useOnShakeEffect(handleFeedback);

  return <SpringboardNative />;
}

import { useCallback } from 'react';

import { Launcher } from '../src/navigation/home/launcher';
import { useOnShakeEffect } from '../src/navigation/hooks/use-shake-gesture';
import { useRetray } from '../src/packages/retray';

import type { Trays } from '../src/trays';

// Home = the iOS SpringBoard launcher (its own navigation tree: grid + demo
// screens with the open-zoom). Shake still opens the feedback tray.
export default function HomeScreen() {
  const { show } = useRetray<Trays>();
  const handleFeedback = useCallback(() => {
    show('help');
  }, [show]);

  useOnShakeEffect(handleFeedback);

  return <Launcher />;
}

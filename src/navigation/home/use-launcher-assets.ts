import { useEffect, useState } from 'react';

import { Asset } from 'expo-asset';

import { ICON_MAP } from './icon-map.generated';

// Every image the launcher paints on its first frame: the wallpaper plus all
// grid icons (the placeholder covers any demo without a real icon yet).
const LAUNCHER_ASSETS = [
  require('../../../assets/images/home-wallpaper-mono.webp'),
  require('../../../assets/app-icons/_placeholder.png'),
  ...Object.values(ICON_MAP),
];

// Resolves the launcher's images before the grid is revealed, so the home
// never paints with a blank wallpaper or icons popping in one by one. The
// splash screen stays up until this flips true (see app/_layout.tsx).
//
// In release the assets are bundled files and this is a fast existence pass;
// in dev each asset is fetched from Metro once and then served from cache.
// Failures never block launch — worst case an icon loads late, exactly the
// behavior we had before the gate.
export const useLauncherAssets = () => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    Asset.loadAsync(LAUNCHER_ASSETS)
      .catch(() => {})
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  return ready;
};

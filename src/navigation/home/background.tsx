import { StyleSheet } from 'react-native';

import { Image } from 'expo-image';

// SpringBoard wallpaper: a static dark image (a glowing loupe ring on pure
// black — baked to a PNG, no live shader cost on the home). The open-zoom scales
// the grid down and reveals the layer behind it, so the launcher root + router
// card are pure black (see launcher.tsx / _layout.tsx) matching the wallpaper's
// black edges, so the revealed area blends seamlessly instead of flashing.
export const Background = () => (
  <Image
    source={require('../../../assets/images/home-wallpaper.png')}
    style={StyleSheet.absoluteFill}
    contentFit="cover"
    cachePolicy="memory-disk"
  />
);

import { StyleSheet } from 'react-native';

import { Image } from 'expo-image';

// SpringBoard wallpaper: a soft light image behind the icon grid. The open-zoom
// scales the grid down and reveals the layer behind it, so the launcher root +
// router card are kept a matching light tone (see launcher.tsx / _layout.tsx) —
// the revealed area blends with this wallpaper instead of flashing a hard edge.
export const Background = () => (
  <Image
    source={require('../../../assets/images/home-wallpaper.png')}
    style={StyleSheet.absoluteFill}
    contentFit="cover"
    cachePolicy="memory-disk"
  />
);

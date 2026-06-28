import { StyleSheet } from 'react-native';

import { Image } from 'expo-image';

// SpringBoard wallpaper: a static shader-style mesh-gradient image (soft pastel
// blobs on a light base — an Apple-esque look, baked to a PNG so there's no
// live shader cost on the home). Kept light: the open-zoom scales the grid down
// and reveals the layer behind it, so the launcher root + router card are a
// matching light tone (see launcher.tsx / _layout.tsx) and the revealed area
// blends seamlessly instead of flashing a hard edge.
export const Background = () => (
  <Image
    source={require('../../../assets/images/home-wallpaper.png')}
    style={StyleSheet.absoluteFill}
    contentFit="cover"
    cachePolicy="memory-disk"
  />
);

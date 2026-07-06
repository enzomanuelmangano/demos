import { StyleSheet } from 'react-native';

import { Image } from 'expo-image';

// SpringBoard wallpaper: a static image, no live shader cost on the home.
// Center-cropped to portrait + downscaled at import time so the decode stays
// cheap. The layer behind it stays pure black (launcher root / _layout host),
// blending with the image's dark edges wherever a transition reveals it.
export const Background = () => (
  <Image
    source={require('../../../assets/images/home-wallpaper-mono.webp')}
    style={StyleSheet.absoluteFill}
    contentFit="cover"
    cachePolicy="memory-disk"
  />
);

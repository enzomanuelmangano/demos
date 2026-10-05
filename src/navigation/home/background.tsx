import { StyleSheet } from 'react-native';

import { Image } from 'expo-image';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { homeIntro, wallpaperIntro } from './home-intro';

// SpringBoard wallpaper: a static dark image (a glowing loupe ring on pure
// black — baked to a PNG, no live shader cost on the home). The open-zoom scales
// the grid down and reveals the layer behind it, so the launcher root + router
// card are pure black (see launcher.tsx / _layout.tsx) matching the wallpaper's
// black edges, so the revealed area blends seamlessly instead of flashing.
//
// On the home's entrance it settles from a little too large and out of focus.
// The focus is not a live blur: a copy of the wallpaper an eighth of its size,
// blurred once, lies over it and fades. Scaled up it is as soft as a blur, its
// decode is nothing, and the fade is an opacity — no layout, no commit.
export const Background = () => {
  const rWallpaper = useAnimatedStyle(() => ({
    transform: [{ scale: wallpaperIntro(homeIntro.get()).scale }],
  }));
  const rBlur = useAnimatedStyle(() => ({
    opacity: wallpaperIntro(homeIntro.get()).blur,
  }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, rWallpaper]}>
      <Image
        source={require('../../../assets/images/home-wallpaper.png')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
      />
      <Animated.View style={[StyleSheet.absoluteFill, rBlur]}>
        <Image
          source={require('../../../assets/images/home-wallpaper-blur.jpg')}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      </Animated.View>
    </Animated.View>
  );
};

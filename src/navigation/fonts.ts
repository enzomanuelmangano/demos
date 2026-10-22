import { useFonts } from 'expo-font';

// Only the demos draw these: the home and the app shell use the system font.
// The root starts loading them at launch without waiting on them, and a demo
// waits for them before it mounts (by then they are long done), so the first
// frame of the home no longer waits on eleven font registrations.
const DEMO_FONTS = {
  'SF-Pro-Rounded-Bold': require('../../assets/fonts/SF-Pro-Rounded-Bold.otf'),
  'SF-Pro-Rounded-Heavy': require('../../assets/fonts/SF-Pro-Rounded-Heavy.otf'),
  'SF-Compact-Rounded-Medium': require('../../assets/fonts/SF-Compact-Rounded-Medium.otf'),
  regular: require('../../assets/fonts/regular.ttf'),
  outfit: require('../../assets/fonts/outfit.ttf'),
  bold: require('../../assets/fonts/bold.ttf'),
  'AddingtonCF-Light': require('../../assets/fonts/AddingtonCF-Light.otf'),
  'FiraCode-Regular': require('../../assets/fonts/FiraCode-Regular.ttf'),
  FiraCodeMedium: require('../../assets/fonts/FiraCode-Medium.ttf'),
  'Honk-Regular': require('../../assets/fonts/honk-regular.otf'),
  'Honk-Bold': require('../../assets/fonts/honk-bold.otf'),
};

/** Whether the demo fonts are registered; starts loading them on first use. */
export const useDemoFonts = (): boolean => {
  const [loaded, error] = useFonts(DEMO_FONTS);
  // A font that fails to load must not keep every demo from opening.
  return loaded || error != null;
};

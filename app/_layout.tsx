import { LogBox, StatusBar, StyleSheet, View } from 'react-native';

// TODO: Remove after upgrading to react-navigation v8
LogBox.ignoreLogs([/InteractionManager.*deprecated/]);

import { memo, Suspense, useCallback, useEffect } from 'react';

import { useFonts } from 'expo-font';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { PressablesConfig } from 'pressto';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { Background } from '../src/navigation/home/background';
import { useOta } from '../src/navigation/hooks/use-ota';
import { useQuickActions } from '../src/navigation/hooks/use-quick-actions';
import { Retray, RetrayThemes } from '../src/packages/retray';
import { trays } from '../src/trays';

SplashScreen.preventAutoHideAsync();

SplashScreen.setOptions({
  duration: 500,
  fade: true,
});

const QuickActionsProvider = memo(
  ({ children }: { children: React.ReactNode }) => {
    useQuickActions();
    return <>{children}</>;
  },
);

// Transparent screens over a wallpaper that lives OUTSIDE the navigation
// stack. UIKit's native zoom (Link.AppleZoom) scales the whole source screen
// during its pushback — wallpaper included, which visibly zoomed the wallpaper
// on every open/dismiss. Real SpringBoard never scales the wallpaper: it lives
// in a layer the transition doesn't touch. Same trick here: the wallpaper
// renders once BEHIND the Stack (sibling, not screen content), the home screen
// is transparent, so the pushback scales only the icon grid over a still
// wallpaper. Demo screens paint their own opaque backgrounds, so they're
// unaffected.
const stackScreenOptions = {
  headerShown: false,
  contentStyle: { backgroundColor: 'transparent' },
} as const;

export default function RootLayout() {
  // Check for OTA updates
  useOta();
  const router = useRouter();

  const onLayoutRootView = useCallback(() => {
    SplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    Linking.getInitialURL().then(url => {
      if (url) {
        const data = Linking.parse(url);
        if (data.path) {
          // @@TODO: investigate (needed for universal links)
          router.push(data.path);
        }
      }
    });
  }, [router]);

  return (
    <Suspense>
      <StatusBar barStyle="default" animated />
      <KeyboardProvider>
        <GestureHandlerRootView style={styles.fill} onLayout={onLayoutRootView}>
          <PressablesConfig
            globalHandlers={globalPressableHandlers}
            defaultProps={{ rippleColor: 'transparent' }}>
            <FontsProvider>
              <Retray.Theme theme={RetrayThemes.light}>
                <Retray.Navigator screens={trays}>
                  <QuickActionsProvider>
                    <View style={styles.host}>
                      {/* Wallpaper pinned outside the navigator — the native
                          zoom's pushback never scales it (see comment above). */}
                      <Background />
                      <Stack screenOptions={stackScreenOptions} />
                    </View>
                  </QuickActionsProvider>
                </Retray.Navigator>
              </Retray.Theme>
            </FontsProvider>
          </PressablesConfig>
        </GestureHandlerRootView>
      </KeyboardProvider>
    </Suspense>
  );
}

const FontsProvider = ({ children }: { children: React.ReactNode }) => {
  const [fontsLoaded] = useFonts({
    'SF-Pro-Rounded-Bold': require('../assets/fonts/SF-Pro-Rounded-Bold.otf'),
    'SF-Pro-Rounded-Heavy': require('../assets/fonts/SF-Pro-Rounded-Heavy.otf'),
    'SF-Compact-Rounded-Medium': require('../assets/fonts/SF-Compact-Rounded-Medium.otf'),
    regular: require('../assets/fonts/regular.ttf'),
    outfit: require('../assets/fonts/outfit.ttf'),
    bold: require('../assets/fonts/bold.ttf'),
    'AddingtonCF-Light': require('../assets/fonts/AddingtonCF-Light.otf'),
    'FiraCode-Regular': require('../assets/fonts/FiraCode-Regular.ttf'),
    FiraCodeMedium: require('../assets/fonts/FiraCode-Medium.ttf'),
    'Honk-Regular': require('../assets/fonts/honk-regular.otf'),
    'Honk-Bold': require('../assets/fonts/honk-bold.otf'),
  });

  if (!fontsLoaded) {
    return null;
  }

  return <>{children}</>;
};

const globalPressableHandlers = {
  onPress: () => {
    Haptics.selectionAsync();
  },
};

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  // Black base under the wallpaper image (shows only until it loads / behind
  // its edges) — matches the dark loupe wallpaper.
  host: {
    backgroundColor: '#000000',
    flex: 1,
  },
});

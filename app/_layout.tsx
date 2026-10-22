import { StatusBar, StyleSheet } from 'react-native';

import { memo, Suspense, useCallback, useEffect } from 'react';

import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { PressablesConfig } from 'pressto';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { ChoreographyProvider } from 'react-native-screen-choreography/expo-router';

import { useDemoFonts } from '../src/navigation/fonts';
import { useOta } from '../src/navigation/hooks/use-ota';
import { useQuickActions } from '../src/navigation/hooks/use-quick-actions';
import { perfMark } from '../src/navigation/perf-log';
import { useTouchIndicatorSync } from '../src/navigation/states/touches';
import { Retray, RetrayThemes } from '../src/packages/retray';
import { trays } from '../src/trays';

SplashScreen.preventAutoHideAsync();

// Longest the splash waits for the home to lift it.
const SPLASH_FALLBACK_MS = 3000;

// No fade: the home makes its own entrance the moment the splash lifts (see
// src/navigation/home/home-intro.ts), and any dissolve left the icons half
// transparent over their first frames.
SplashScreen.setOptions({
  duration: 0,
  fade: false,
});

const QuickActionsProvider = memo(
  ({ children }: { children: React.ReactNode }) => {
    useQuickActions();
    return <>{children}</>;
  },
);

// Black card behind the SpringBoard, matching the wallpaper's black edges.
const stackScreenOptions = {
  headerShown: false,
  contentStyle: { backgroundColor: '#000000' },
} as const;

// A demo is not pushed like a screen: it opens out of the icon that was tapped.
// The icon travels in the choreography overlay and the demo draws the growing
// card under it (see src/navigation/home/launch-transition.tsx), so the route
// is a transparent layer over the SpringBoard with no native animation — a
// second, native movement would show under the one moving card. It lives in
// THIS stack, next to the home route: the choreography adapter watches the
// source route's own navigator for the new top route.
const demoScreenOptions = {
  headerShown: false,
  presentation: 'containedTransparentModal',
  animation: 'none',
  gestureEnabled: false,
  contentStyle: { backgroundColor: 'transparent' },
} as const;

perfMark('root-layout-module');

export default function RootLayout() {
  // Start registering the demo fonts now; nothing here waits on them.
  useDemoFonts();
  // Check for OTA updates
  useOta();
  // The "Show Touches" overlay, re-armed on launch (see the General tray).
  useTouchIndicatorSync();
  const router = useRouter();

  // The home lifts the splash itself, on its first frame, and makes its
  // entrance under it (see src/navigation/home/home-intro.ts). This is the
  // fallback for a launch that never shows the home (a deep link straight
  // into a demo); hiding twice is harmless.
  const onLayoutRootView = useCallback(() => {
    setTimeout(() => SplashScreen.hideAsync(), SPLASH_FALLBACK_MS);
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
      {/* Preloaded by the home once its entrance is over, not here. */}
      <KeyboardProvider preload={false}>
        <GestureHandlerRootView style={styles.fill} onLayout={onLayoutRootView}>
          <PressablesConfig
            globalHandlers={globalPressableHandlers}
            defaultProps={{ rippleColor: 'transparent' }}>
            <Retray.Theme theme={RetrayThemes.light}>
              <Retray.Navigator screens={trays}>
                <QuickActionsProvider>
                  <ChoreographyProvider>
                    <Stack screenOptions={stackScreenOptions}>
                      <Stack.Screen name="index" />
                      <Stack.Screen name="launch" options={demoScreenOptions} />
                      <Stack.Screen
                        name="animations/[slug]"
                        options={demoScreenOptions}
                      />
                    </Stack>
                  </ChoreographyProvider>
                </QuickActionsProvider>
              </Retray.Navigator>
            </Retray.Theme>
          </PressablesConfig>
        </GestureHandlerRootView>
      </KeyboardProvider>
    </Suspense>
  );
}

const globalPressableHandlers = {
  onPress: () => {
    Haptics.selectionAsync();
  },
};

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});

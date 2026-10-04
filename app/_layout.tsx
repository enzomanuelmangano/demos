import { LogBox, StatusBar, StyleSheet } from 'react-native';

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
import { ChoreographyProvider } from 'react-native-screen-choreography/expo-router';

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
                    <ChoreographyProvider>
                      <Stack screenOptions={stackScreenOptions}>
                        <Stack.Screen name="index" />
                        <Stack.Screen
                          name="launch"
                          options={demoScreenOptions}
                        />
                        <Stack.Screen
                          name="animations/[slug]"
                          options={demoScreenOptions}
                        />
                      </Stack>
                    </ChoreographyProvider>
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
});

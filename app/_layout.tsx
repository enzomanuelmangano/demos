import { LogBox, StatusBar, StyleSheet } from 'react-native';

// TODO: Remove after upgrading to react-navigation v8
LogBox.ignoreLogs([/InteractionManager.*deprecated/]);

import { memo, Suspense, useCallback, useEffect } from 'react';

import { useFonts } from 'expo-font';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import Drawer from 'expo-router/drawer';
import * as SplashScreen from 'expo-splash-screen';
import { PressablesConfig } from 'pressto';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import {
  DrawerContent,
  DrawerContentWidth,
} from '../src/navigation/components/drawer-content';
import { useOta } from '../src/navigation/hooks/use-ota';
import { useQuickActions } from '../src/navigation/hooks/use-quick-actions';
import { Retray, RetrayThemes } from '../src/packages/retray';
import { trays } from '../src/trays';

SplashScreen.preventAutoHideAsync();

SplashScreen.setOptions({
  duration: 500,
  fade: true,
});

const drawerOptions = {
  headerShown: false,
  drawerStyle: {
    backgroundColor: '#000',
    width: 270,
  },
  drawerActiveTintColor: '#fff',
  drawerInactiveTintColor: '#666',
  drawerLabelStyle: {
    fontSize: 16,
    fontWeight: '500',
  },
  overlayColor: 'rgba(0, 0, 0, 0.5)',
  swipeEnabled: true,
  swipeEdgeWidth: DrawerContentWidth,
} as const;

const QuickActionsProvider = memo(
  ({ children }: { children: React.ReactNode }) => {
    useQuickActions();
    return <>{children}</>;
  },
);

const mainScreenOptions = {
  drawerLabel: 'Home',
  title: 'Home',
} as const;

const animationScreenOptions = {
  drawerLabel: 'Animation',
  title: 'Animation',
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
                    <Drawer
                      drawerContent={DrawerContent}
                      screenOptions={drawerOptions}>
                      <Drawer.Screen name="index" options={mainScreenOptions} />
                      <Drawer.Screen
                        name="animations/[slug]"
                        options={animationScreenOptions}
                      />
                    </Drawer>
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

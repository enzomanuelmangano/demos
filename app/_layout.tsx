import { Dimensions, StatusBar, StyleSheet } from 'react-native';

import { Suspense, useCallback } from 'react';

import { useFonts } from 'expo-font';
import * as Haptics from 'expo-haptics';
import Drawer from 'expo-router/drawer';
import * as SplashScreen from 'expo-splash-screen';
import { PressablesConfig } from 'pressto';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { DrawerContent } from '../src/navigation/components/drawer-content';
import { useOta } from '../src/navigation/hooks/use-ota';
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
  swipeEdgeWidth: Dimensions.get('window').width * 0.35,
} as const;

export default function RootLayout() {
  // Check for OTA updates
  useOta();

  const onLayoutRootView = useCallback(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <Suspense>
      <StatusBar barStyle="default" animated />
      <KeyboardProvider>
        <GestureHandlerRootView style={styles.fill} onLayout={onLayoutRootView}>
          <PressablesConfig globalHandlers={globalPressableHandlers}>
            <FontsProvider>
              <Retray.Theme theme={RetrayThemes.light}>
                <Retray.Navigator screens={trays}>
                  <Drawer
                    drawerContent={DrawerContent}
                    screenOptions={drawerOptions}>
                    <Drawer.Screen
                      name="index"
                      options={{
                        drawerLabel: 'Home',
                        title: 'Home',
                      }}
                    />
                    <Drawer.Screen
                      name="animations/[slug]"
                      options={{
                        drawerLabel: 'Animation',
                        title: 'Animation',
                      }}
                    />
                  </Drawer>
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

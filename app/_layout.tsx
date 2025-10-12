import { Dimensions, StatusBar, StyleSheet } from 'react-native';

import { Suspense } from 'react';

import { useFonts } from 'expo-font';
import * as Haptics from 'expo-haptics';
import { Drawer } from 'expo-router/drawer';
import { PressablesConfig } from 'pressto';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { CustomDrawerContent } from '../src/navigation/components/custom-drawer-content';
import { useOta } from '../src/navigation/hooks/use-ota';

export default function RootLayout() {
  // Check for OTA updates
  useOta();

  return (
    <Suspense>
      <StatusBar barStyle="default" animated />
      <KeyboardProvider>
        <PressablesConfig globalHandlers={globalPressableHandlers}>
          <GestureHandlerRootView style={styles.fill}>
            <FontsProvider>
              <Drawer
                drawerContent={CustomDrawerContent}
                screenOptions={drawerScreenOptions}>
                <Drawer.Screen name="index" options={homeOptions} />
                <Drawer.Screen
                  name="animations/[slug]"
                  options={animationOptions}
                />
              </Drawer>
            </FontsProvider>
          </GestureHandlerRootView>
        </PressablesConfig>
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

const drawerScreenOptions = {
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

const homeOptions = {
  drawerLabel: 'Home',
  title: 'Home',
};

const animationOptions = {
  drawerLabel: 'Animation',
  title: 'Animation',
};

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});

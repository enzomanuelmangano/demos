import { StatusBar, StyleSheet } from 'react-native';

import { Suspense, useCallback } from 'react';

import { useFonts } from 'expo-font';
import * as Haptics from 'expo-haptics';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { PressablesConfig } from 'pressto';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { useOta } from '../src/navigation/hooks/use-ota';

SplashScreen.preventAutoHideAsync();

SplashScreen.setOptions({
  duration: 500,
  fade: true,
});

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
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen
                  name="(drawer)"
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="feedback"
                  options={{
                    presentation: 'modal',
                    // animation: 'fade',
                  }}
                />
              </Stack>
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

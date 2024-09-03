import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Font from 'expo-font';
import { StyleSheet } from 'react-native';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Import the custom font file
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import sfProRoundedBold from './assets/fonts/SF-Pro-Rounded-Bold.otf';
import { App } from './src';
import { StackedToastProvider } from './src/stacked-toast-manager';

// AppContainer component definition
export const ClerkToast = () => {
  // State to track whether custom fonts have been loaded
  const [fontsLoaded, setFontsLoaded] = useState(false);

  // Load custom fonts using async Font.loadAsync
  useEffect(() => {
    (async () => {
      await Font.loadAsync({
        'SF-Pro-Rounded-Bold': sfProRoundedBold,
      });
      setFontsLoaded(true);
    })();
  }, []);

  // Render the AppContainer with GestureHandlerRootView and SafeAreaProvider
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={localStyles.fill}>
        <StackedToastProvider>{fontsLoaded && <App />}</StackedToastProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
};

// Styles for the AppContainer component
const localStyles = StyleSheet.create({
  fill: { flex: 1 },
});

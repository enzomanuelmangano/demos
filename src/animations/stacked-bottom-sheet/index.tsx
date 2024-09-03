/* eslint-disable @typescript-eslint/ban-ts-comment */

import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Font from 'expo-font';
import { StyleSheet } from 'react-native';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Import the custom font file
// @ts-ignore
import sfProRoundedBold from './assets/fonts/SF-Pro-Rounded-Bold.otf';
import { App } from './src';
import { StackedSheetProvider } from './src/stacked-sheet-manager';

export const StackedBottomSheet = () => {
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
        <StackedSheetProvider>{fontsLoaded && <App />}</StackedSheetProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
};

// Styles for the AppContainer component
const localStyles = StyleSheet.create({
  fill: { flex: 1 },
});

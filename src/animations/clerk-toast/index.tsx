import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Import the custom font file
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore

import { App } from './src';
import { StackedToastProvider } from './src/stacked-toast-manager';

// AppContainer component definition
export const ClerkToast = () => {
  // Render the AppContainer with GestureHandlerRootView and SafeAreaProvider
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={localStyles.fill}>
        <StackedToastProvider>
          <App />
        </StackedToastProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
};

// Styles for the AppContainer component
const localStyles = StyleSheet.create({
  fill: { flex: 1 },
});

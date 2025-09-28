import { StyleSheet } from 'react-native';

import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { App } from './src';
import { StackedToastProvider } from './src/stacked-toast-manager';

export const ClerkToast = () => {
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

const localStyles = StyleSheet.create({
  fill: { flex: 1 },
});

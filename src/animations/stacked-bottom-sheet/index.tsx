import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { App } from './src';
import { StackedSheetProvider } from './src/stacked-sheet-manager';

export const StackedBottomSheet = () => {
  // Render the AppContainer with GestureHandlerRootView and SafeAreaProvider
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={localStyles.fill}>
        <StackedSheetProvider>
          <App />
        </StackedSheetProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
};

// Styles for the AppContainer component
const localStyles = StyleSheet.create({
  fill: { flex: 1 },
});

import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { App } from './src';
import { FontsProvider } from './src/providers/fonts-provider';

const AppContainer = () => {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <FontsProvider>
          <StatusBar style="dark" />
          <App />
        </FontsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
};

export { AppContainer as DotSheet };

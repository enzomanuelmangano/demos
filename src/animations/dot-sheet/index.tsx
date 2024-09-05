import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { App } from './src';

const AppContainer = () => {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <App />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
};

export { AppContainer as DotSheet };

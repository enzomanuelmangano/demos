import * as Haptics from 'expo-haptics';
import { Stack } from 'expo-router';
import { PressablesConfig } from 'pressto';
import { Suspense } from 'react';
import { StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { FontsProvider } from '../src/components/fonts-provider';

const globalPressableHandlers = {
  onPress: () => {
    Haptics.selectionAsync();
  },
};

export default function RootLayout() {
  return (
    <Suspense>
      <StatusBar barStyle={'default'} animated />
      <PressablesConfig globalHandlers={globalPressableHandlers}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <FontsProvider>
            <Stack
              screenOptions={{
                headerShown: false,
              }}
            />
          </FontsProvider>
        </GestureHandlerRootView>
      </PressablesConfig>
    </Suspense>
  );
}

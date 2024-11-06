import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Suspense } from 'react';
import { PressablesConfig } from 'pressto';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'react-native';

import { App } from './src';

const globalPressableHandlers = {
  onPress: () => {
    Haptics.selectionAsync();
  },
};

const AppContainer = () => {
  return (
    <Suspense>
      <StatusBar barStyle={'default'} animated />
      <PressablesConfig globalHandlers={globalPressableHandlers}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <App />
        </GestureHandlerRootView>
      </PressablesConfig>
    </Suspense>
  );
};

// eslint-disable-next-line import/no-default-export
export default AppContainer;

import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Suspense } from 'react';
import { PressablesConfig } from 'pressto';
import * as Haptics from 'expo-haptics';

import { App } from './src';

const globalPressableHandlers = {
  onPress: () => {
    Haptics.selectionAsync();
  },
};

const AppContainer = () => {
  return (
    <Suspense>
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

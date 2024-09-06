import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Suspense } from 'react';

import { App } from './src';

const AppContainer = () => {
  return (
    <Suspense>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <App />
      </GestureHandlerRootView>
    </Suspense>
  );
};

// eslint-disable-next-line import/no-default-export
export default AppContainer;

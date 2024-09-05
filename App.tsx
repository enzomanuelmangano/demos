import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Suspense, useEffect } from 'react';

import { App } from './src';
import { prepareAssets } from './src/animations/swipe-cards';

const AppContainer = () => {
  useEffect(() => {
    prepareAssets();
  }, []);

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

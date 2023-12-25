import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useEffect } from 'react';

import { App } from './src';
import { prepareAssets } from './src/animations/swipe-cards';

const AppContainer = () => {
  useEffect(() => {
    prepareAssets();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <App />
    </GestureHandlerRootView>
  );
};

// eslint-disable-next-line import/no-default-export
export default AppContainer;

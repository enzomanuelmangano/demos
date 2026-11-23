import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { App } from './src';

export const Steps = () => {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <App />
    </GestureHandlerRootView>
  );
};

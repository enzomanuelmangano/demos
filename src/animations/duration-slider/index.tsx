import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { App } from './src';

const DurationSlider = () => (
  <GestureHandlerRootView style={{ flex: 1 }}>
    <App />
  </GestureHandlerRootView>
);

export { DurationSlider };

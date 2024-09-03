import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Fonts from 'expo-font';

import { App } from './src';

export const Steps = () => {
  const [loaded] = Fonts.useFonts({
    'SF-Pro-Rounded-Bold': require('./assets/fonts/SF-Pro-Rounded-Bold.otf'),
  });

  if (!loaded) {
    return <></>;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <App />
    </GestureHandlerRootView>
  );
};

import { useFonts } from 'expo-font';

import { App } from './src';

export const MilesBarChart = () => {
  const [loaded] = useFonts({
    'FiraCode-Regular': require('./assets/fonts/FiraCode-Regular.ttf'),
  });
  if (!loaded) {
    return <></>;
  }
  return <App />;
};

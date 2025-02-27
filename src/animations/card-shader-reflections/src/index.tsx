import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { CardCarousel } from './components/card-carousel/card-carousel';

export const CardShaderReflections = () => {
  return (
    <View style={{ flex: 1 }}>
      <CardCarousel />
      <StatusBar style="light" />
    </View>
  );
};

import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { FluidSlider } from './components/fluid-slider';

const FluidSliderContainer = () => {
  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      {/* 
          In the height you should also consider the space 
          for the Animated Metaball (with the Text)  
      */}
      <FluidSlider
        style={{
          width: '90%',
          height: 110,
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export { FluidSliderContainer as FluidSlider };

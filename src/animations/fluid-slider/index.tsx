import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { FluidSlider } from './components/fluid-slider';

const FluidSliderContainer = () => {
  const { width: windowWidth } = useWindowDimensions();

  return (
    <View style={styles.container}>
      {/* 
          In the height you should also consider the space 
          for the Animated Metaball (with the Text)  
      */}
      <FluidSlider width={windowWidth} height={100} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    flex: 1,
    justifyContent: 'center',
  },
});

export { FluidSliderContainer as FluidSlider };

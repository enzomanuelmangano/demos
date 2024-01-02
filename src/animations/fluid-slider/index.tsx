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
      <FluidSlider width={windowWidth * 0.9} height={110} />
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

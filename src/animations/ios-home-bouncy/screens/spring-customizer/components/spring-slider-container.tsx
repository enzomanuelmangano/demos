import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useSharedValue, useAnimatedReaction } from 'react-native-reanimated';

import type { ClosingSpringConfigShared } from '../../../animations/bouncy';

import { SpringConfigSlider } from './spring-config-slider';

type SpringSliderContainerProps = {
  mutableConfig: typeof ClosingSpringConfigShared;
};

export const SpringSliderContainer: React.FC<SpringSliderContainerProps> = ({
  mutableConfig,
}) => {
  // Use shared values for config
  const mass = useSharedValue(mutableConfig.get().mass);
  const damping = useSharedValue(mutableConfig.get().damping);
  const stiffness = useSharedValue(mutableConfig.get().stiffness);

  useAnimatedReaction(
    () => ({
      mass: mass.value,
      damping: damping.value,
      stiffness: stiffness.value,
    }),
    config => {
      mutableConfig.set(config);
    },
  );

  return (
    <View style={styles.card}>
      <SpringConfigSlider
        label="Mass"
        valueSharedValue={mass}
        minimumValue={0.1}
        maximumValue={100}
        step={0.1}
      />
      <SpringConfigSlider
        label="Damping"
        valueSharedValue={damping}
        minimumValue={1}
        maximumValue={200}
        step={1}
      />
      <SpringConfigSlider
        label="Stiffness"
        valueSharedValue={stiffness}
        minimumValue={1}
        maximumValue={500}
        step={1}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: 32,
    borderCurve: 'continuous',
    padding: 24,
    shadowColor: '#D1D5DB',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 6,
    borderWidth: 1,
    borderColor: 'rgba(243, 244, 246, 0.8)',
  },
});

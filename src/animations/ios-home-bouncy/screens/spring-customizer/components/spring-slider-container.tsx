import { StyleSheet, View } from 'react-native';

import { type FC } from 'react';

import { useAnimatedReaction, useSharedValue } from 'react-native-reanimated';

import { SpringConfigSlider } from './spring-config-slider';

import type { ClosingSpringConfigShared } from '../../../animations/bouncy';

type SpringSliderContainerProps = {
  mutableConfig: typeof ClosingSpringConfigShared;
};

export const SpringSliderContainer: FC<SpringSliderContainerProps> = ({
  mutableConfig,
}) => {
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
    borderColor: 'rgba(243, 244, 246, 0.8)',
    borderCurve: 'continuous',
    borderRadius: 32,
    borderWidth: 1,
    elevation: 6,
    padding: 24,
    shadowColor: '#D1D5DB',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 16,
  },
});

import { StyleSheet, Text, View } from 'react-native';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import { AntDesign } from '@expo/vector-icons';
import { useMemo } from 'react';
import debounce from 'lodash/debounce';

import { FrictionSlider } from './components/friction-slider';
import { AnimatedSquares } from './components/animated-squares';
import { hapticFeedback } from './utils/haptic';

export const TwodosSlide = () => {
  const progress = useSharedValue(0);
  const clampedProgress = useSharedValue(0);

  const debouncedHapticFeedback = useMemo(
    // This is super helpful to avoid calling the haptic feedback multiple times
    // Try to remove the debounce and see how many times the haptic feedback is called
    () => debounce(hapticFeedback, 1000, { leading: true, trailing: false }),
    [],
  );

  return (
    <View style={styles.fill}>
      <View style={styles.squaresContainer}>
        <AnimatedSquares
          clampedProgress={clampedProgress}
          progress={progress}
          size={120}
        />
      </View>
      <View style={styles.fill}>
        <FrictionSlider
          containerStyle={styles.frictionSliderContainer}
          onProgressChange={({
            clampedProgress: cProgress,
            realProgress: rProgress,
          }) => {
            'worklet';
            if (progress.value >= 1) {
              // This is going to be called every time the progress changes
              // So the idea is to call the haptic feedback only once when the progress is 1
              // With a debounce (leading: true, trailing: false)
              runOnJS(debouncedHapticFeedback)();
              // unlock with Burnt
              // Burnt.toast({
              //   title: 'Unlocked 🎉',
              // });
            }

            progress.value = rProgress;
            clampedProgress.value = cProgress;
          }}>
          <Text style={styles.slideActionLabel}>Slide to Unlock</Text>
          <AntDesign name="arrowright" size={20} color="gray" />
        </FrictionSlider>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  squaresContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  frictionSliderContainer: {
    marginTop: 45,
    paddingBottom: 280,
    paddingTop: 20,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  slideActionLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 5,
    color: 'gray',
  },
});

import { StyleSheet, Text, View } from 'react-native';

import { useMemo, useState } from 'react';

import { AntDesign } from '@expo/vector-icons';
import debounce from 'lodash.debounce';
import { useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AnimatedSquares } from './components/animated-squares';
import { FrictionSlider } from './components/friction-slider';
import { hapticFeedback } from './utils/haptic';

export const TwodosSlide = () => {
  const progress = useSharedValue(0);
  const clampedProgress = useSharedValue(0);

  // e2e outcome probe: the unlock is a worklet event (haptic + visual) with no
  // inspectable RN state. We latch "unlocked" once the drag reaches full
  // progress, so the assertion proves the slider actually unlocked.
  // Near-invisible (alpha ~0.01).
  const [status, setStatus] = useState<'locked' | 'unlocked'>('locked');

  const debouncedHapticFeedback = useMemo(
    // This is super helpful to avoid calling the haptic feedback multiple times
    // Try to remove the debounce and see how many times the haptic feedback is called
    () => debounce(hapticFeedback, 1000, { leading: true, trailing: false }),
    [],
  );

  return (
    <View style={styles.fill}>
      <Text testID="twodos-slide-status" style={styles.statusProbe}>
        {status}
      </Text>
      <View style={styles.squaresContainer}>
        <AnimatedSquares
          clampedProgress={clampedProgress}
          progress={progress}
          size={120}
        />
      </View>
      <View style={styles.fill}>
        <FrictionSlider
          testID="twodos-slide-slider"
          containerStyle={styles.frictionSliderContainer}
          onProgressChange={({
            clampedProgress: cProgress,
            realProgress: rProgress,
          }) => {
            'worklet';
            if (progress.get() >= 1) {
              // This is going to be called every time the progress changes
              // So the idea is to call the haptic feedback only once when the progress is 1
              // With a debounce (leading: true, trailing: false)
              scheduleOnRN(debouncedHapticFeedback);
              scheduleOnRN(setStatus, 'unlocked');
              // unlock with Burnt
              // Burnt.toast({
              //   title: 'Unlocked 🎉',
              // });
            }

            progress.set(rProgress);
            clampedProgress.set(cProgress);
          }}>
          <Text style={styles.slideActionLabel}>Slide to Unlock</Text>
          <AntDesign name="arrow-right" size={20} color="gray" />
        </FrictionSlider>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  frictionSliderContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 45,
    paddingBottom: 280,
    paddingTop: 20,
  },
  slideActionLabel: {
    color: 'gray',
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 5,
  },
  squaresContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
  },
  statusProbe: {
    color: '#000',
    fontSize: 1,
    left: 0,
    opacity: 0.012,
    position: 'absolute',
    top: 0,
    zIndex: 10,
  },
});

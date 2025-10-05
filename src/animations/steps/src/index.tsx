import { StyleSheet, View } from 'react-native';

import { useCallback, useState } from 'react';

import { useAnimatedReaction, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Dots } from './steps/dots';
import { StepButtons } from './steps/step-buttons';

const App = () => {
  const activeIndex = useSharedValue(0);
  const [isLastStep, setIsLastStep] = useState(false);

  const rightLabel = isLastStep ? 'Finish' : 'Continue';

  const increaseActiveIndex = useCallback(() => {
    activeIndex.set((activeIndex.get() + 1) % 3);
  }, [activeIndex]);

  const decreaseActiveIndex = useCallback(() => {
    activeIndex.set(Math.max(0, activeIndex.get() - 1));
  }, [activeIndex]);

  useAnimatedReaction(
    () => activeIndex.get(),
    index => {
      scheduleOnRN(setIsLastStep, index === 2);
    },
  );

  return (
    <View style={styles.container}>
      <Dots activeIndex={activeIndex} count={3} dotSize={10} />
      <StepButtons
        activeIndex={activeIndex}
        rightLabel={rightLabel}
        backButtonLabel="Back"
        onBack={decreaseActiveIndex}
        onContinue={increaseActiveIndex}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#fff',
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 64,
  },
});

export { App };

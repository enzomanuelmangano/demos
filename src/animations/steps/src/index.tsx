import { StyleSheet, Text, View } from 'react-native';

import { useCallback, useState } from 'react';

import { useAnimatedReaction, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Dots } from './steps/dots';
import { StepButtons } from './steps/step-buttons';

const App = () => {
  const activeIndex = useSharedValue(0);
  const [isLastStep, setIsLastStep] = useState(false);

  // e2e outcome probe: exposes the current step index so a test can assert that
  // Continue/Back actually advanced the flow. Near-invisible.
  const [stepIndex, setStepIndex] = useState(0);

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
      scheduleOnRN(setStepIndex, index);
    },
  );

  return (
    <View style={styles.container}>
      <Text testID="steps-status" style={styles.statusProbe}>
        {`step:${stepIndex}`}
      </Text>
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
  // Near-invisible to the eye, but on-screen for the e2e accessibility tree.
  statusProbe: {
    position: 'absolute',
    top: 0,
    left: 0,
    fontSize: 1,
    color: '#808080',
    opacity: 0.012,
    zIndex: 10,
  },
});

export { App };

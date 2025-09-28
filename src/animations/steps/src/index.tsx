import { StyleSheet, View } from 'react-native';

import { useCallback, useState } from 'react';

import { AntDesign } from '@expo/vector-icons';
import Animated, {
  Keyframe,
  useAnimatedReaction,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Dots } from './steps/dots';
import { SplitButton } from './steps/split-button';

const ScaleOpacityKeyframe = {
  from: {
    opacity: 0,
    transform: [{ scale: 0 }],
  },
  to: {
    opacity: 1,
    transform: [{ scale: 1 }],
  },
};

// Instead of using Entering and Exiting Layout Animations, we can use Keyframes!
// I created a detailed tutorial about it at https://www.reanimate.dev
const ScaleIconEnteringKeyframe = new Keyframe(ScaleOpacityKeyframe).duration(
  250,
);

const ScaleIconExitingKeyframe = new Keyframe({
  from: ScaleOpacityKeyframe.to,
  to: ScaleOpacityKeyframe.from,
}).duration(200);

const App = () => {
  const activeIndex = useSharedValue(0);
  const [splitted, setSplitted] = useState(false);
  const [isLastStep, setIsLastStep] = useState(false);

  const rightLabel = isLastStep ? 'Finish' : 'Continue';

  const increaseActiveIndex = useCallback(() => {
    activeIndex.value = (activeIndex.value + 1) % 3;
  }, [activeIndex]);

  useAnimatedReaction(
    () => activeIndex.value,
    index => {
      scheduleOnRN(setIsLastStep, index === 2);
    },
  );

  return (
    <View style={styles.container}>
      <Dots activeIndex={activeIndex} count={3} dotSize={10} />
      <View style={{ marginTop: 48 }}>
        {/*
         * I explained in detail in one of my tutorials how to recreate (almost) this exact component:
         * Split Button: https://youtu.be/GxkzFYI6eqI
         * Side note: the code can be cleaner 😅
         */}
        <SplitButton
          splitted={splitted}
          mainAction={{
            label: 'Continue',
            labelColor: 'white',
            onPress: () => {
              increaseActiveIndex();
              setSplitted(true);
            },
            backgroundColor: '#0c86f7',
          }}
          leftAction={{
            label: 'Back',
            labelColor: 'black',
            onPress: () => {
              if (activeIndex.value === 1) {
                setSplitted(false);
              }
              activeIndex.value = Math.max(0, activeIndex.value - 1);
            },
            backgroundColor: 'rgba(0,0,0,0.08)',
          }}
          rightAction={{
            label: rightLabel,
            labelColor: 'white',
            icon: (
              <Animated.View
                entering={ScaleIconEnteringKeyframe}
                exiting={ScaleIconExitingKeyframe}
                style={styles.icon}>
                <AntDesign name="check-circle" size={18} color="white" />
              </Animated.View>
            ),
            iconVisible: isLastStep,
            onPress: () => {
              if (activeIndex.value === 2) {
                setSplitted(false);
              }
              increaseActiveIndex();
            },
            backgroundColor: '#0c86f7',
          }}
        />
      </View>
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
  icon: {
    alignItems: 'center',
    height: 18,
    justifyContent: 'center',
    marginBottom: -1.5,
    marginRight: 8,
    width: 18,
  },
});

export { App };

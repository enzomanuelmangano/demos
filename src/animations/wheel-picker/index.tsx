import { StyleSheet, View } from 'react-native';

import { useState } from 'react';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { PressableScale } from 'pressto';
import {
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AnimatedCount } from './components/animated-count/animated-count';
import { DraggableSlider } from './components/draggable-slider';

const LinesAmount = 50;

export const WheelPicker = () => {
  const [isExpanded, setIsExpanded] = useState(false);

  const animatedSpacePerLine = useDerivedValue<number>(() => {
    return withSpring(isExpanded ? 50 : 20, {
      dampingRatio: 1,
      duration: 500,
    });
  }, [isExpanded]);

  const progress = useSharedValue(0);
  const previousLineIndex = useSharedValue(-1);

  const animatedNumber = useDerivedValue(() => {
    // Play with the multiplier
    // At the beginning I was planning to add it in the demo
    // But the final video was too long for Twitter :)
    const multiplier = 1;
    return Math.ceil(progress.value * LinesAmount * multiplier);
  }, [progress]);

  return (
    <View style={styles.container}>
      <AnimatedCount
        count={animatedNumber}
        maxDigits={10}
        textDigitWidth={44}
        textDigitHeight={80}
        fontSize={65}
      />
      {/*
       * I created this component for the Prequel Slider demo:
       * https://www.patreon.com/posts/image-editor-and-100916590
       * However, this version solves some bugs with the big lines
       * + now the spacing is fully customizable and the progress
       *   is independent from the rebound effect (since it's decoupled from the withSpring function)
       */}
      <DraggableSlider
        scrollableAreaHeight={150}
        spacePerLine={animatedSpacePerLine}
        showBoundaryGradient
        bigLineIndexOffset={20}
        snapEach={1}
        linesAmount={LinesAmount}
        maxLineHeight={20}
        minLineHeight={10}
        onProgressChange={sliderProgress => {
          'worklet';
          if (sliderProgress < 0) {
            return;
          }

          const currentLineIndex = Math.floor(sliderProgress * LinesAmount);

          // Only trigger haptics when crossing a line
          if (currentLineIndex !== previousLineIndex.value) {
            scheduleOnRN(Haptics.selectionAsync);
            previousLineIndex.value = currentLineIndex;
          }

          progress.value = sliderProgress;
        }}
      />
      <PressableScale
        style={styles.button}
        onPress={() => {
          setIsExpanded(prev => !prev);
        }}>
        <MaterialCommunityIcons
          name={!isExpanded ? 'arrow-expand' : 'arrow-collapse'}
          size={28}
          color="white"
        />
      </PressableScale>
    </View>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    aspectRatio: 1,
    backgroundColor: '#111',
    borderRadius: 32,
    bottom: 48,
    height: 64,
    justifyContent: 'center',
    position: 'absolute',
    right: 32,
  },
  container: {
    alignItems: 'center',
    backgroundColor: '#FFF',
    flex: 1,
    justifyContent: 'center',
  },
});

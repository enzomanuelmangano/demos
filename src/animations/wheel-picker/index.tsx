import { StyleSheet, View } from 'react-native';
import {
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PressableScale } from 'pressto';

import { AnimatedCount } from './components/animated-count/animated-count';
import { DraggableSlider } from './components/draggable-slider';

const LinesAmount = 50;

export const WheelPicker = () => {
  const [isExpanded, setIsExpanded] = useState(false);

  const animatedSpacePerLine = useDerivedValue(() => {
    return withTiming(isExpanded ? 50 : 20);
  }, [isExpanded]);

  const progress = useSharedValue(0);
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
  container: {
    flex: 1,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    position: 'absolute',
    bottom: 48,
    right: 32,
    height: 64,
    aspectRatio: 1,
    borderRadius: 32,
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

import { Alert, StyleSheet, Text, View } from 'react-native';

import { useRef, useState } from 'react';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PressableScale } from 'pressto';
import { useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AnimatedCount } from './components/animated-count/animated-count';
import { CircularDraggableSlider } from './components/draggable-slider';
import { useToggle } from './hooks/useToggle';
import { hapticLight } from './utils/haptics';

import type { CircularDraggableSliderRefType } from './components/draggable-slider';

const LinesAmount = 200;

const App = () => {
  const animatedNumber = useSharedValue(0);
  const previousTick = useSharedValue(0);
  const [isTimerEnabled, toggleTimer] = useToggle(false);

  // e2e outcome probe: flips to "moved" once the circular slider has been
  // dragged to a non-zero value (the ruler is a Skia/worklet view).
  const [status, setStatus] = useState<'idle' | 'moved'>('idle');

  const circularSliderRef = useRef<CircularDraggableSliderRefType>(null);

  return (
    <View style={styles.container}>
      <Text testID="pomodoro-timer-status" style={styles.statusProbe}>
        {status}
      </Text>
      <View
        style={{
          marginBottom: 256,
        }}>
        <AnimatedCount
          count={animatedNumber}
          maxDigits={5}
          textDigitWidth={68}
          textDigitHeight={120}
          fontSize={100}
          color="#fff"
          gradientAccentColor="#000"
        />
      </View>
      <CircularDraggableSlider
        ref={circularSliderRef}
        bigLineIndexOffset={10}
        linesAmount={LinesAmount}
        indicatorColor={'orange'}
        maxLineHeight={40}
        lineColor="rgba(255,255,255,0.5)"
        bigLineColor="white"
        minLineHeight={30}
        onCompletion={async () => {
          // wait 1 second
          await new Promise(resolve => setTimeout(resolve, 1000));
          // You can show an alert or do something else here
          Alert.alert('Timer completed 🤌', '', [
            {
              text: 'OK',
              onPress: () => {
                toggleTimer();
                circularSliderRef.current?.resetTimer();
              },
            },
          ]);
        }}
        onProgressChange={sliderProgress => {
          'worklet';
          if (sliderProgress < 0) {
            return;
          }

          // Only trigger haptics when crossing a line (when tick value changes)
          if (sliderProgress !== previousTick.get()) {
            scheduleOnRN(hapticLight);
            previousTick.set(sliderProgress);
          }

          if (sliderProgress > 0) {
            scheduleOnRN(setStatus, 'moved');
          }

          // Bind the progress value to the animated number
          animatedNumber.set(sliderProgress);
        }}
      />
      <View style={styles.buttonsContainer}>
        <PressableScale
          testID="pomodoro-timer-start"
          style={styles.button}
          onPress={() => {
            toggleTimer();
            if (!isTimerEnabled) {
              return circularSliderRef.current?.runTimer(animatedNumber.get());
            }

            circularSliderRef.current?.stopTimer();
            circularSliderRef.current?.resetTimer();
          }}>
          <MaterialCommunityIcons
            name={!isTimerEnabled ? 'timer' : 'stop'}
            size={28}
            color="#111"
          />
        </PressableScale>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    aspectRatio: 1,
    backgroundColor: 'white',
    borderRadius: 32,
    height: 64,
    justifyContent: 'center',
  },
  buttonsContainer: {
    bottom: 48,
    flexDirection: 'row',
    gap: 8,
    position: 'absolute',
    right: 32,
  },
  container: {
    alignItems: 'center',
    backgroundColor: '#000',
    flex: 1,
    justifyContent: 'center',
  },
  // Near-invisible to the eye, but on-screen for the e2e accessibility tree.
  statusProbe: {
    position: 'absolute',
    top: 0,
    left: 0,
    fontSize: 1,
    color: '#FFFFFF',
    opacity: 0.012,
    zIndex: 10,
  },
});

export { App };

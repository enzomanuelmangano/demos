import { Alert, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import { useRef } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AnimatedCount } from './components/animated-count/animated-count';
import type { CircularDraggableSliderRefType } from './components/draggable-slider';
import { CircularDraggableSlider } from './components/draggable-slider';
import { PressableScale } from './components/pressable-scale';
import { FontsProvider } from './components/fonts-provider';
import { useToggle } from './hooks/useToggle';
import { hapticLight } from './utils/haptics';

const LinesAmount = 200;

const App = () => {
  const animatedNumber = useSharedValue(0);
  const [isTimerEnabled, toggleTimer] = useToggle(false);

  const circularSliderRef = useRef<CircularDraggableSliderRefType>(null);

  return (
    <FontsProvider>
      <View style={styles.container}>
        <StatusBar style="light" />
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
            runOnJS(hapticLight)();
            if (sliderProgress < 0) {
              return;
            }
            // Bind the progress value to the animated number
            animatedNumber.value = sliderProgress;
          }}
        />
        <View style={styles.buttonsContainer}>
          <PressableScale
            style={styles.button}
            onPress={() => {
              toggleTimer();
              if (!isTimerEnabled) {
                return circularSliderRef.current?.runTimer(
                  animatedNumber.value,
                );
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
    </FontsProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonsContainer: {
    position: 'absolute',
    bottom: 48,
    right: 32,
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    height: 64,
    aspectRatio: 1,
    borderRadius: 32,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export { App };

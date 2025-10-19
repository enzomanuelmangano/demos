import { Text, View, useWindowDimensions, StyleSheet } from 'react-native';

import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useDerivedValue } from 'react-native-reanimated';
import { ReText } from 'react-native-redash';

import { WaveformScrubberSample } from './waveform-sample';
import { DURATION, Palette } from '../../constants';
import { zeroPad } from '../../helpers';
import { useCurrentPlayingValue } from './waveform-sample/use-current-playing-value';

type WaveformScrubberProps = {
  waveformSamples: number[];
};

const WaveformScrubber: React.FC<WaveformScrubberProps> = ({
  waveformSamples,
}) => {
  const { width: screenWidth } = useWindowDimensions();
  const waveformScrubberWidth = screenWidth * 0.95;
  const waveformPaddingHorizontal = 20;
  const waveformContentWidth =
    waveformScrubberWidth - waveformPaddingHorizontal;

  const { panGesture, isDragging, currentX } = useCurrentPlayingValue({
    waveformContentWidth,
  });

  const currentTime = useDerivedValue(() => {
    const seconds = (currentX.value / waveformContentWidth) * DURATION;

    return `0:${zeroPad(Math.min(Math.floor(seconds), DURATION), 2)}`;
  }, []);

  return (
    <View>
      <View style={{ flexDirection: 'row' }}>
        <View style={styles.timeContainer}>
          <ReText text={currentTime} style={styles.timeText} />
        </View>
        <View style={{ flex: 1 }} />
        <View style={styles.timeContainer}>
          <Text style={styles.timeText}>0:{DURATION}</Text>
        </View>
      </View>

      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            {
              width: waveformScrubberWidth,
            },
            styles.samplesContainer,
          ]}>
          {waveformSamples.map((val, i) => {
            return (
              <WaveformScrubberSample
                key={i}
                position={(waveformContentWidth / waveformSamples.length) * i}
                currentX={currentX}
                isDragging={isDragging}
                value={val}
              />
            );
          })}
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  samplesContainer: {
    backgroundColor: Palette.primary,
    borderCurve: 'continuous',
    borderRadius: 15,
    flexDirection: 'row',
    height: 80,
    paddingHorizontal: 18,
  },
  timeContainer: {
    alignItems: 'center',
    aspectRatio: 16 / 9,
    backgroundColor: Palette.primary,
    borderCurve: 'continuous',
    borderRadius: 10,
    height: 35,
    justifyContent: 'center',
    marginBottom: 15,
  },
  timeText: {
    color: Palette.body,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    width: '100%',
  },
});

export { WaveformScrubber };

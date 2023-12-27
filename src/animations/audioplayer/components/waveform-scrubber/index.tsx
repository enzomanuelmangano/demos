import { Text, View, useWindowDimensions, StyleSheet } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useDerivedValue } from 'react-native-reanimated';
import { ReText } from 'react-native-redash';

import { zeroPad } from '../../helpers';
import { DURATION, Palette } from '../../constants';

import { WaveformScrubberSample } from './waveform-sample';
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
  timeContainer: {
    height: 35,
    aspectRatio: 16 / 9,
    borderRadius: 10,
    backgroundColor: Palette.primary,
    marginBottom: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeText: {
    color: Palette.body,
    fontSize: 14,
    fontWeight: '700',
    width: '100%',
    textAlign: 'center',
  },
  samplesContainer: {
    height: 80,
    backgroundColor: Palette.primary,
    borderRadius: 15,
    flexDirection: 'row',
    paddingHorizontal: 18,
  },
});

export { WaveformScrubber };

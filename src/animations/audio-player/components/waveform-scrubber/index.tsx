import { Text, View, useWindowDimensions, StyleSheet } from 'react-native';

import { useState } from 'react';

import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedReaction,
  useDerivedValue,
} from 'react-native-reanimated';
import { ReText } from 'react-native-redash';
import { scheduleOnRN } from 'react-native-worklets';

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
    const seconds = (currentX.get() / waveformContentWidth) * DURATION;

    return `0:${zeroPad(Math.min(Math.floor(seconds), DURATION), 2)}`;
  }, []);

  // e2e outcome probe: flips to "scrubbed" once the playhead moves off the
  // start, so a test can assert the drag actually moved the scrubber position.
  const [status, setStatus] = useState<'idle' | 'scrubbed'>('idle');
  useAnimatedReaction(
    () => currentX.get() > 1,
    moved => {
      if (moved) {
        scheduleOnRN(setStatus, 'scrubbed');
      }
    },
    [],
  );

  return (
    <View>
      <Text testID="audio-player-status" style={styles.statusProbe}>
        {`audio:${status}`}
      </Text>
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
          testID="audio-player-waveform"
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
  // Near-invisible to the eye, but on-screen + opaque enough for the
  // accessibility/view tree to expose it to e2e (alpha >= 0.01).
  statusProbe: {
    color: Palette.body,
    fontSize: 1,
    left: 0,
    opacity: 0.012,
    position: 'absolute',
    top: 0,
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

import { StyleSheet, useWindowDimensions, View } from 'react-native';

import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { Palette } from '../../../../constants/palette';
import { TabBarHeight } from '../constants';
import { ExpandedSheetMutableProgress } from '../shared-progress';
import { MiniPlayerHeight } from './constants';
import { SheetContent } from './sheet-content';

export const ExpandedSheet = () => {
  const { height: windowHeight } = useWindowDimensions();
  const progress = ExpandedSheetMutableProgress;

  const isTapped = useSharedValue(false);
  const progressThreshold = 0.8;
  const safeTop = useSafeAreaInsets().top;

  const tapGesture = Gesture.Tap()
    .onBegin(() => {
      if (progress.get() >= progressThreshold) {
        return;
      }
      isTapped.set(true);
    })
    .onTouchesUp(() => {
      if (progress.get() >= progressThreshold) {
        return;
      }
      scheduleOnRN(Haptics.selectionAsync);

      progress.set(
        withSpring(1, {
          dampingRatio: 1,
          duration: 600,
        }),
      );
    })
    .onFinalize(() => {
      isTapped.set(false);
    });

  const panEnabled = useSharedValue(false);
  const panGesture = Gesture.Pan()
    .onBegin(() => {
      if (progress.get() === 0) return;
      panEnabled.set(true);
    })
    .onUpdate(event => {
      if (!panEnabled.get()) return;
      progress.set(interpolate(event.translationY, [0, windowHeight], [1, 0]));
    })
    .onFinalize(() => {
      if (!panEnabled.get()) return;
      panEnabled.set(false);
      progress.set(
        withSpring(progress.get() > progressThreshold ? 1 : 0, {
          dampingRatio: 1,
          duration: 600,
        }),
      );
    });

  const rSheetStyle = useAnimatedStyle(() => {
    return {
      height: interpolate(
        progress.get(),
        [0, 1],
        [MiniPlayerHeight, windowHeight],
      ),
      bottom: interpolate(progress.get(), [0, 1], [TabBarHeight, 0]),
      left: interpolate(progress.get(), [0, 1], [16, 0]),
      right: interpolate(progress.get(), [0, 1], [16, 0]),
      backgroundColor: interpolateColor(
        progress.get(),
        [0, 1],
        [Palette.card, Palette.background],
      ),
      borderColor: interpolateColor(
        progress.get(),
        [0, 0.9, 1],
        ['rgba(255, 255, 255, 0.1)', 'rgba(255, 255, 255, 0.1)', 'transparent'],
      ),
      borderRadius: interpolate(progress.get(), [0, 0.9, 1], [16, 48, 0]),
      borderWidth: interpolate(
        progress.get(),
        [0, 0.9, 1],
        [StyleSheet.hairlineWidth, StyleSheet.hairlineWidth, 0],
      ),
      shadowOpacity: interpolate(progress.get(), [0, 1], [0.2, 0.5]),
      transform: [
        {
          scale: withSpring(isTapped.get() ? 0.98 : 1),
        },
      ],
    };
  });

  const rKnobStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(
        progress.get(),
        [0, progressThreshold / 2, 1],
        [0, 0, 1],
      ),
    };
  });

  const gestures = Gesture.Simultaneous(tapGesture, panGesture);

  return (
    <GestureDetector gesture={gestures}>
      <Animated.View style={[rSheetStyle, styles.container]}>
        <Animated.View
          style={[
            rKnobStyle,
            {
              top: safeTop + 8,
            },
            styles.knobContainer,
          ]}>
          <View style={styles.knob} />
        </Animated.View>
        <SheetContent
          progress={progress}
          title="Happiness does not wait"
          subtitle="Ólafur Arnalds"
          imageUrl="https://i3.ytimg.com/vi/BgO08T3E4LE/maxresdefault.jpg"
        />
      </Animated.View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  container: {
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    position: 'absolute',
    shadowColor: Palette.card,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 16,
    zIndex: 1000,
  },
  knob: {
    backgroundColor: '#767676',
    borderRadius: 24,
    height: 4,
    width: 48,
  },
  knobContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    width: '100%',
  },
});

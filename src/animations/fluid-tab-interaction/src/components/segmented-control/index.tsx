import { StyleSheet, View } from 'react-native';

import { useMemo } from 'react';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PressableScale } from 'pressto';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Palette } from '../../constants';
import { AnimatedBlurView } from '../animated-blur-view';

const AnimatedIcon = Animated.createAnimatedComponent(MaterialCommunityIcons);

const TimingConfig = {
  duration: 1000,
  easing: Easing.bezier(0.4, 0.0, 0.2, 1),
};

type SegmentedControlProps<T extends { name: string; icon: string }> = {
  data: readonly T[];
  onPress: (item: T) => void;
  selected: T;
  width: number;
  height: number;
};

function SegmentedControl<T extends { name: string; icon: string }>({
  data,
  onPress,
  selected,
  width,
  height,
}: SegmentedControlProps<T>) {
  const internalPadding = 5;

  const cellBackgroundWidth = width / data.length;
  const activeIndexes = useSharedValue<number[]>([]);

  const selectedCellIndex = useMemo(
    () => data.findIndex(item => item === selected),
    [data, selected],
  );

  const blurProgress = useSharedValue(0);

  const animatedBlurProps = useAnimatedProps(() => {
    return {
      intensity: interpolate(blurProgress.value, [0, 0.5, 1], [0, 15, 0]),
    };
  }, [blurProgress]);

  const rCellMessageStyle = useAnimatedStyle(() => {
    const padding = interpolate(
      selectedCellIndex,
      [0, data.length - 1],
      [internalPadding, -internalPadding],
    );
    // Example (with 5 items):
    // 0 -> internalPadding / 2
    // 1 ->  internalPadding / 4
    // 2 -> 0
    // 3 -> -internalPadding / 4
    // 4 -> -internalPadding / 2
    return {
      left: withTiming(
        cellBackgroundWidth * selectedCellIndex + padding,
        TimingConfig,
      ),
    };
  }, [selectedCellIndex]);

  const rCellBlurMessageStyle = useAnimatedStyle(() => {
    return {
      left: withTiming(cellBackgroundWidth * selectedCellIndex, TimingConfig),
    };
  }, [selectedCellIndex]);

  return (
    <View
      style={[
        localStyles.backgroundContainer,
        {
          backgroundColor: Palette.baseGray05,
          width,
          height,
          padding: internalPadding,
        },
      ]}>
      {data.map((item, index) => {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        const internalBlurProps = useAnimatedProps(() => {
          return {
            intensity: interpolate(
              activeIndexes.value.includes(index) ? blurProgress.value : 0,
              [0, 0.5, 1],
              [0, 10, 0],
            ),
          };
        }, [blurProgress]);

        // eslint-disable-next-line react-hooks/rules-of-hooks
        const rLabelStyle = useAnimatedStyle(() => {
          return {
            color: withTiming(
              selectedCellIndex === index
                ? Palette.highlightLabel
                : Palette.baseLabel,
              TimingConfig,
            ),
          };
        }, [selectedCellIndex, index]);

        return (
          <PressableScale
            key={item.name}
            style={localStyles.labelContainer}
            onPress={() => {
              onPress(item);
              const prevIndex = data.findIndex(
                dataItem => dataItem.name === selected.name,
              );
              if (prevIndex === index) {
                return;
              }
              activeIndexes.value = [prevIndex, index];
              cancelAnimation(blurProgress);
              blurProgress.value = withTiming(1, TimingConfig, () => {
                blurProgress.value = 0;
                activeIndexes.value = [];
              });
            }}>
            <AnimatedIcon
              name={item.icon as keyof typeof MaterialCommunityIcons.glyphMap}
              size={13}
              style={rLabelStyle}
            />
            <Animated.Text style={[localStyles.difficultyLabel, rLabelStyle]}>
              {item.name}
            </Animated.Text>
            <AnimatedBlurView
              animatedProps={internalBlurProps}
              tint="light"
              style={localStyles.blurView}
            />
          </PressableScale>
        );
      })}

      <Animated.View
        style={[
          {
            width: cellBackgroundWidth - internalPadding / data.length,
            height: height - internalPadding * 2,
          },
          localStyles.highlightedCellContent,
          rCellMessageStyle,
        ]}
      />
      <Animated.View
        style={[
          {
            width: cellBackgroundWidth,
            height: height,
            zIndex: 10,
          },
          localStyles.highlightedCellBlurContent,
          rCellBlurMessageStyle,
        ]}>
        <AnimatedBlurView
          animatedProps={animatedBlurProps}
          tint="light"
          style={localStyles.fill}
        />
      </Animated.View>
    </View>
  );
}

const localStyles = StyleSheet.create({
  backgroundContainer: {
    borderColor: Palette.baseGray05,
    borderRadius: 30,
    borderWidth: 1,
    flexDirection: 'row',
  },
  blurView: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 1,
  },
  difficultyLabel: {
    color: Palette.baseGray80,
    fontFamily: 'Honk-Regular',
    fontSize: 14,
    textAlign: 'center',
  },
  fill: {
    flex: 1,
  },
  highlightedCellBlurContent: {
    alignSelf: 'center',
    position: 'absolute',
    zIndex: 1,
  },
  highlightedCellContent: {
    alignSelf: 'center',
    backgroundColor: Palette.background,
    borderColor: Palette.baseGray05,
    borderRadius: 30,
    borderWidth: 1,
    position: 'absolute',
    shadowOffset: { height: 1, width: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    zIndex: 1,
  },
  labelContainer: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    zIndex: 2,
  },
});

export { SegmentedControl };

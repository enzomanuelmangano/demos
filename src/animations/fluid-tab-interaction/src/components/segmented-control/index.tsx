import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { PressableScale } from 'pressto';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { Palette } from '../../constants';
import { AnimatedBlurView } from '../animated-blur-view';

const AnimatedIcon = Animated.createAnimatedComponent(MaterialCommunityIcons);

const TimingConfig = {
  duration: 1000,
  easing: Easing.bezier(0.4, 0.0, 0.2, 1),
};

// Define a type for the SegmentedControl component's props
type SegmentedControlProps<T extends { name: string; icon: string }> = {
  data: readonly T[]; // An array of items to display in the control
  onPress: (item: T) => void; // A function to handle item selection
  selected: T; // The currently selected item
  width: number; // The width of the control
  height: number; // The height of the control
};

// Define the SegmentedControl component
function SegmentedControl<T extends { name: string; icon: string }>({
  data,
  onPress,
  selected,
  width,
  height,
}: SegmentedControlProps<T>) {
  // Internal padding for spacing between elements
  const internalPadding = 5;

  // Calculate the width of each cell background based on the number of items
  const cellBackgroundWidth = width / data.length;
  const activeIndexes = useSharedValue<number[]>([]);

  // Find the index of the selected item in the data array
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

  // Create an animated style for the selected cell background
  const rCellMessageStyle = useAnimatedStyle(() => {
    // Define the padding based on the selected item's index
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
              // Call the provided onPress function with the selected item
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

      {/* CELL BACKGROUND */}
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
  fill: {
    flex: 1,
  },
  blurView: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  backgroundContainer: {
    flexDirection: 'row',
    borderRadius: 30,
    borderWidth: 1, // Add border to the entire control
    borderColor: Palette.baseGray05,
  },
  difficultyLabel: {
    fontSize: 14,
    fontFamily: 'Honk-Regular',
    color: Palette.baseGray80,
    textAlign: 'center',
  },
  highlightedCellBlurContent: {
    zIndex: 1,
    alignSelf: 'center',
    position: 'absolute',
  },
  highlightedCellContent: {
    zIndex: 1,
    alignSelf: 'center',
    position: 'absolute',
    backgroundColor: Palette.background,
    borderRadius: 30,
    borderWidth: 1, // Add border to separate cells
    borderColor: Palette.baseGray05,
    shadowOpacity: 0.1,
    shadowOffset: { height: 1, width: 0 },
    shadowRadius: 2,
  },
  labelContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    flexDirection: 'row',
    gap: 5,
  },
});

export { SegmentedControl };

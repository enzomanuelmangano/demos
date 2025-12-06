import { StyleSheet, Text, View } from 'react-native';

import { useMemo } from 'react';

import { PressableScale } from 'pressto';
import Animated, {
  interpolate,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

import { Palette } from '../../constants/palette';

// Define a type for the SegmentedControl component's props
type SegmentedControlProps<T extends string> = {
  data: readonly T[]; // An array of items to display in the control
  onPress: (item: T) => void; // A function to handle item selection
  selected: T; // The currently selected item
  width: number; // The width of the control
  height: number; // The height of the control
};

// Define the SegmentedControl component
function SegmentedControl<T extends string>({
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

  // Find the index of the selected item in the data array
  const selectedCellIndex = useMemo(
    () => data.findIndex(item => item === selected),
    [data, selected],
  );

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
      left: withSpring(cellBackgroundWidth * selectedCellIndex + padding),
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
      {data.map(difficulty => {
        return (
          <PressableScale
            key={difficulty}
            style={[localStyles.labelContainer]}
            onPress={() => {
              // Call the provided onPress function with the selected item
              onPress(difficulty);
            }}>
            <Text style={localStyles.difficultyLabel}>{difficulty}</Text>
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
    </View>
  );
}

// Define local styles using StyleSheet.create
const localStyles = StyleSheet.create({
  backgroundContainer: {
    borderColor: Palette.baseGray05,
    borderCurve: 'continuous',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
  },
  difficultyLabel: {
    color: Palette.baseGray80,
    fontFamily: 'SF-Compact-Rounded-Medium',
    fontSize: 17,
    textAlign: 'center',
  },
  highlightedCellContent: {
    alignSelf: 'center',
    backgroundColor: Palette.background,
    borderColor: Palette.baseGray05,
    borderCurve: 'continuous',
    borderRadius: 12,
    borderWidth: 1,
    boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.1)',
    position: 'absolute',
    zIndex: 1,
  },
  labelContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    zIndex: 2,
  },
});

export { SegmentedControl };

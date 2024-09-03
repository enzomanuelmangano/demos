// Import necessary modules and types from React and React Native
import React, { useCallback, useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';

// Import utility function to get an array with commas
import { getCommasArray } from '../../utils/get-commas-array';

// Import the AnimatedSingleNumber component
import { AnimatedSingleNumber } from './individual-number';

// Define the props for the AnimatedNumber component
type AnimatedNumberProps = {
  value: number;
};

// AnimatedNumber component definition
export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({ value }) => {
  // Split the value into an array of characters
  const splittedValue = useMemo(() => {
    return value.toString().split('');
  }, [value]);

  // Generate an array with comma positions based on the value
  const commas = useMemo(() => {
    return getCommasArray(value);
  }, [value]);

  // Constants for styling and layout
  // I'm not very proud of this constants, but I didn't find a better way to do it
  const ITEM_WIDTH = 55;
  const ITEM_HEIGHT = 100;
  // The scale will decrease based on the number of digits
  const SCALE = 1 - splittedValue.length * 0.05;
  // The point of SCALED_WIDTH and SCALE_WIDTH_OFFSET is to make the scale less noticeable
  // for the width of the AnimatedSingleNumber component (so it doesn't look too stretched)
  const SCALE_WIDTH_OFFSET = 0.08; // Feel free to put 0 here to see the difference (it's not that bad)
  const SCALED_WIDTH = ITEM_WIDTH * (SCALE + SCALE_WIDTH_OFFSET);
  // The space between commas will decrease based on the number of digits
  const COMMA_SPACE = 10 * (1 - splittedValue.length * 0.025);

  // Callback function to build an individual AnimatedSingleNumber component
  const buildIndividualNumber = useCallback(
    (params: {
      index: number;
      item: string;
      containerStyle?: StyleProp<ViewStyle>;
    }) => {
      return (
        <AnimatedSingleNumber
          index={params.index}
          value={params.item}
          scale={SCALE}
          scaleWidthOffset={SCALE_WIDTH_OFFSET}
          key={params.index + params.item.toString()}
          // Make space for commas
          rightSpace={
            commas.slice(0, params.index).filter(v => v === ',').length *
            COMMA_SPACE
          }
          totalNumbersLength={splittedValue.length}
          itemWidth={ITEM_WIDTH}
          itemHeight={ITEM_HEIGHT}
          containerStyle={[styles.itemContainer, params.containerStyle ?? {}]}
          style={styles.item}
        />
      );
    },
    [COMMA_SPACE, SCALE, commas, splittedValue.length],
  );

  // Render the AnimatedNumber component
  return (
    <View
      style={{
        flexDirection: 'row',
        // Adjust position based on the number of commas
        right: commas.filter(v => v === ',').length * COMMA_SPACE,
        top: 10,
        backgroundColor: 'transparent', // <-- This is needed for Android
      }}>
      {/* Render individual AnimatedSingleNumber components for each digit */}
      {splittedValue.map((item, index) => {
        return buildIndividualNumber({ index, item });
      })}
      {/* Render AnimatedSingleNumber components for commas */}
      {commas.map((item, index) => {
        // Skip rendering if the item is an empty string
        if (item === '') return null;

        // Render AnimatedSingleNumber for the comma with additional styling
        return buildIndividualNumber({
          index,
          item,
          containerStyle: {
            marginLeft: SCALED_WIDTH / 2 + COMMA_SPACE / 2,
          },
        });
      })}
    </View>
  );
};

// Styles for the AnimatedNumber component
const styles = StyleSheet.create({
  item: {
    fontSize: 90,
    color: 'white',
    fontWeight: 'bold',
    width: 60,
    textAlign: 'center',
    fontFamily: 'SF-Pro-Rounded-Bold',
  },
  itemContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});

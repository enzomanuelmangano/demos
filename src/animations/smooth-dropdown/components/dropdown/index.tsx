// Importing necessary dependencies and types
import React, { useCallback } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';
import {
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import type { DropdownOptionType } from './dropdrop-item';
import { DropdownItem } from './dropdrop-item';

// Defining the props expected by the Dropdown component
type DropdownProps = {
  options: DropdownOptionType[];
  onPick: (option: DropdownOptionType) => void;
  contentContainerStyle?: StyleProp<ViewStyle>;
  header: DropdownOptionType;
  dropDownItemHeight?: number;
};

// Defining some constants to be used in the component
const DROP_DOWN_ITEM_HEIGHT = 75;
const DROP_DOWN_ITEM_PADDING = 10;

// Defining the Dropdown component
const Dropdown: React.FC<DropdownProps> = React.memo(
  ({
    options,
    header,
    onPick,
    contentContainerStyle,
    dropDownItemHeight = DROP_DOWN_ITEM_HEIGHT,
  }) => {
    // Creating an array of options to be passed down to DropdownItem component
    const fullOptions = [header, ...options];

    // Creating a shared value that keeps track of whether the dropdown is expanded or not
    const isToggled = useSharedValue(false);

    // Creating a derived value that maps the isToggled value to a spring animation value
    // Almost all the animations in this app are done using this progress value :)
    const progress = useDerivedValue(() => {
      return withSpring(isToggled.value ? 1 : 0);
    }, []);

    // Calculating the height of the dropdown when it's fully expanded
    const fullDropDownExpandedHeight =
      (dropDownItemHeight + DROP_DOWN_ITEM_PADDING) * options.length;

    // Callback function for when a dropdown item is picked
    const onPickDropdownItem = useCallback(
      (option: DropdownOptionType & { isHeader: boolean }) => {
        if (option.isHeader) {
          // Toggling the isToggled value if the header option is picked
          isToggled.value = !isToggled.value;
          return;
        }
        // Calling the onPick function if a non-header option is picked
        onPick && onPick(option);
      },
      [isToggled, onPick],
    );

    return (
      // Rendering the Dropdown component with DropdownItem components inside it
      <View
        style={[
          {
            alignItems: 'center',
          },
          contentContainerStyle,
        ]}>
        {fullOptions.map((option, index) => {
          return (
            <DropdownItem
              key={index}
              label={option.label}
              iconName={option.iconName}
              onPress={onPickDropdownItem}
              progress={progress}
              isHeader={index === 0}
              index={index}
              itemHeight={dropDownItemHeight}
              maxDropDownHeight={fullDropDownExpandedHeight}
              optionsLength={fullOptions.length}
            />
          );
        })}
      </View>
    );
  },
);

// Exporting the Dropdown component
export { Dropdown };

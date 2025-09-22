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

type DropdownProps = {
  options: DropdownOptionType[];
  onPick: (option: DropdownOptionType) => void;
  contentContainerStyle?: StyleProp<ViewStyle>;
  header: DropdownOptionType;
  dropDownItemHeight?: number;
};

const DROP_DOWN_ITEM_HEIGHT = 75;
const DROP_DOWN_ITEM_PADDING = 10;

const Dropdown: React.FC<DropdownProps> = React.memo(
  ({
    options,
    header,
    onPick,
    contentContainerStyle,
    dropDownItemHeight = DROP_DOWN_ITEM_HEIGHT,
  }) => {
    const fullOptions = [header, ...options];

    const isToggled = useSharedValue(false);

    const progress = useDerivedValue<number>(() => {
      return withSpring(isToggled.value ? 1 : 0);
    }, []);

    const fullDropDownExpandedHeight =
      (dropDownItemHeight + DROP_DOWN_ITEM_PADDING) * options.length;

    const onPickDropdownItem = useCallback(
      (option: DropdownOptionType & { isHeader: boolean }) => {
        if (option.isHeader) {
          isToggled.value = !isToggled.value;
          return;
        }
        onPick && onPick(option);
      },
      [isToggled, onPick],
    );

    return (
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

export { Dropdown };

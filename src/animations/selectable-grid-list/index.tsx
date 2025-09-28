import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { useCallback, useRef } from 'react';

import { MaterialIcons } from '@expo/vector-icons';
import { PressableOpacity } from 'pressto';
import {
  SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { ReText } from 'react-native-redash';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SelectableGridList } from './components/SelectableGridList';
import { SelectableListItem } from './components/SelectableListItem';
import { Palette } from './constants';

import type { GridListRefType } from './components/SelectableGridList';

const GridConfig = {
  itemsPerRow: 4,
  internalPadding: 4,
};

const SelectableGridListContainer = () => {
  const { width } = useWindowDimensions();

  const itemSize = width / GridConfig.itemsPerRow;
  const selectedIndexesAmount = useSharedValue(0);
  const selectedIndexesAmountText = useDerivedValue(() => {
    return selectedIndexesAmount.value.toString();
  });

  const gridListRef = useRef<GridListRefType>(null);

  const rFloatingButtonStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateY: withSpring(selectedIndexesAmount.value === 0 ? 150 : 0),
        },
      ],
    };
  });

  const renderItem = useCallback(
    ({
      index,
      activeIndexes,
    }: {
      index: number;
      activeIndexes: SharedValue<number[]>;
    }) => {
      return (
        <SelectableListItem
          index={index}
          internalPadding={GridConfig.internalPadding}
          containerWidth={itemSize}
          containerHeight={itemSize}
          activeIndexes={activeIndexes}
        />
      );
    },
    [itemSize],
  );

  const { top: safeTop } = useSafeAreaInsets();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: Palette.background,
        paddingTop: safeTop,
      }}>
      <SelectableGridList
        data={new Array(50).fill(0) as number[]}
        gridListRef={gridListRef}
        numColumns={GridConfig.itemsPerRow}
        itemSize={itemSize}
        onSelectionChange={indexes => {
          // When the selection changes, we update the amount of selected items
          // and the text that is displayed on the floating button
          selectedIndexesAmount.value = indexes.length;
        }}
        renderItem={renderItem}
        keyExtractor={(_, index) => index.toString()}
      />
      <PressableOpacity
        onPress={() => {
          gridListRef.current?.reset();
        }}
        style={[styles.floating, rFloatingButtonStyle]}>
        <MaterialIcons name="clear" size={20} color={Palette.background} />
        {/* 
            Note: We're using ReText since we want to listen the updates on the UI Thread.
            selectedIndexesAmountText is a derived value from selectedIndexesAmount.
        */}
        <ReText
          text={selectedIndexesAmountText}
          style={{
            fontSize: 20,
          }}
        />
      </PressableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  floating: {
    alignItems: 'center',
    backgroundColor: Palette.primary,
    borderRadius: 20,
    bottom: 20,
    flexDirection: 'row',
    height: 64,
    justifyContent: 'space-evenly',
    paddingHorizontal: 10,
    position: 'absolute',
    right: 20,
    shadowColor: 'black',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    width: 96,
    zIndex: 1000,
  },
});

export { SelectableGridListContainer as SelectableGridList };

import { StyleSheet, Text, View } from 'react-native';

import { useCallback, useRef } from 'react';

import Animated, {
  type SharedValue,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MeasureableAnimatedView } from './components/MeasureableAnimatedView';
import { SectionListItem } from './components/SectionListItem';
import { data, isHeader } from './constants';
import { useHeaderLayout } from './hooks/useHeaderLayout';
import { useHeaderStyle } from './hooks/useHeaderStyle';

import type { HeaderListItem, ListItem } from './constants';
import type { FlatList, LayoutRectangle } from 'react-native';

const HeaderHeight = 65;
const ItemHeight = 50;

const headers = data.filter(isHeader) as HeaderListItem[];

// Every row has a fixed height, so the list can be laid out up front: without
// it scrollToIndex throws for a header that hasn't been rendered yet
const itemLayouts = data.reduce<{ length: number; offset: number }[]>(
  (acc, item) => {
    const previous = acc[acc.length - 1];
    const offset = previous ? previous.offset + previous.length : 0;
    acc.push({ length: isHeader(item) ? HeaderHeight : ItemHeight, offset });
    return acc;
  },
  [],
);

const getItemLayout = (_: unknown, index: number) => ({
  ...itemLayouts[index],
  index,
});

export const AnimatedIndicatorList = () => {
  const insets = useSafeAreaInsets();
  const contentOffsetY = useSharedValue(0);
  // Where the magic happens :)
  const { headerRefs, headersLayoutX, headersLayoutY } = useHeaderLayout({
    headers,
    data,
    headerHeight: HeaderHeight,
    itemHeight: ItemHeight,
  });

  const { rHeaderListStyle, rIndicatorStyle } = useHeaderStyle({
    contentOffsetY,
    headersLayoutX: headersLayoutX as SharedValue<
      { header: string; value: LayoutRectangle | undefined }[]
    >,
    headersLayoutY,
  });

  const flatlistRef = useRef<FlatList<ListItem | HeaderListItem>>(null);

  const onScroll = useAnimatedScrollHandler({
    onScroll: event => {
      contentOffsetY.set(event.contentOffset.y);
    },
  });

  const onSelectHeaderItem = useCallback((headerItem: string) => {
    const headerIndex = data.findIndex(
      _item => (_item as HeaderListItem).header === headerItem,
    );
    flatlistRef.current?.scrollToIndex({
      index: headerIndex,
    });
  }, []);

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}>
      <Animated.View style={[{ flexDirection: 'row' }, rHeaderListStyle]}>
        {headers.map(({ header }, index) => {
          return (
            <MeasureableAnimatedView
              key={header}
              onTouchStart={() => {
                onSelectHeaderItem(header);
              }}
              ref={value => {
                // this is fixing a crash while navigating back
                // https://github.com/facebook/react-native/issues/32105
                headerRefs[index] = { current: value };
              }}
              style={{
                padding: 20,
              }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: 'bold',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}>
                {header}
              </Text>
            </MeasureableAnimatedView>
          );
        })}
      </Animated.View>
      <Animated.View style={rIndicatorStyle} />

      <Animated.FlatList
        onScroll={onScroll}
        ref={flatlistRef}
        scrollEventThrottle={16}
        data={data}
        getItemLayout={getItemLayout}
        contentContainerStyle={{
          paddingBottom: 400,
        }}
        renderItem={({ item }) => {
          return (
            <SectionListItem
              item={item}
              height={isHeader(item) ? HeaderHeight : ItemHeight}
            />
          );
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    flex: 1,
    overflow: 'hidden',
  },
});

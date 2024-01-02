import { FlatList, SafeAreaView, StyleSheet, Text } from 'react-native';
import Animated, { useSharedValue } from 'react-native-reanimated';
import React, { useCallback, useRef } from 'react';

import { MeasureableAnimatedView } from './components/MeasureableAnimatedView';
import type { HeaderListItem, ListItem } from './constants';
import { isHeader, data } from './constants';
import { useHeaderLayout } from './hooks/useHeaderLayout';
import { useHeaderStyle } from './hooks/useHeaderStyle';
import { SectionListItem } from './components/SectionListItem';

const HeaderHeight = 65;
const ItemHeight = 50;

const headers = data.filter(isHeader) as HeaderListItem[];

export const AnimatedIndicatorList = () => {
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
    headersLayoutX,
    headersLayoutY,
  });

  const flatlistRef = useRef<FlatList<ListItem | HeaderListItem>>(null);

  const onSelectHeaderItem = useCallback((headerItem: string) => {
    const headerIndex = data.findIndex(
      _item => (_item as HeaderListItem).header === headerItem,
    );
    flatlistRef.current?.scrollToIndex({
      index: headerIndex,
    });
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      {/* Animated Header Section */}
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

      {/* List */}
      <FlatList
        onScroll={e => {
          contentOffsetY.value = e.nativeEvent.contentOffset.y;
        }}
        ref={flatlistRef}
        scrollEventThrottle={16}
        data={data}
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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
});

import React from 'react';
import type { LayoutRectangle } from 'react-native';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';

type SectionTabsProps = {
  height: number;
  width: number;
  data: string[];
  indicatorLayout: SharedValue<LayoutRectangle>;
  onSelectSection?: (index: number) => void;
  onLayoutChange: (index: number, layout: LayoutRectangle) => void;
  onInitialLayout: (layout: LayoutRectangle) => void;
};

const SectionTabs: React.FC<SectionTabsProps> = React.memo(
  ({
    height,
    width,
    data,
    indicatorLayout,
    onSelectSection,
    onLayoutChange,
    onInitialLayout,
  }) => {
    const insets = useSafeAreaInsets();

    const rIndicatorLayoutStyle = useAnimatedStyle(() => {
      return {
        position: 'absolute',
        top: indicatorLayout.value.y + height - 35,
        left: indicatorLayout.value.x,
        width: indicatorLayout.value.width,
        height: 2,
        backgroundColor: 'black',
        zIndex: 10,
        borderRadius: 5,
      };
    }, [height]);

    const handleLayout = React.useCallback(
      (index: number, layout: LayoutRectangle) => {
        onLayoutChange(index, layout);

        if (index === 0) {
          onInitialLayout(layout);
        }
      },
      [onLayoutChange, onInitialLayout],
    );

    return (
      <View
        style={[
          styles.safeContainer,
          {
            width,
            height,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}>
        <Animated.View style={rIndicatorLayoutStyle} />
        {data.map((title, index) => {
          return (
            <TouchableOpacity
              key={index}
              onPress={() => onSelectSection?.(index)}
              style={[styles.container, { width: width / data.length }]}
              activeOpacity={0.7}>
              <Text
                onLayout={({ nativeEvent: { layout } }) => {
                  handleLayout(index, layout);
                }}
                style={styles.title}>
                {title}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#000',
  },
  safeContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 5,
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
});

export { SectionTabs };

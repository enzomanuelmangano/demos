import { StyleSheet, Text, View } from 'react-native';

import { type FC, memo, useCallback } from 'react';

import { PressableOpacity } from 'pressto';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { LayoutRectangle } from 'react-native';

type SectionTabsProps = {
  height: number;
  width: number;
  data: string[];
  indicatorLayout: SharedValue<LayoutRectangle>;
  onSelectSection?: (index: number) => void;
  onLayoutChange: (index: number, layout: LayoutRectangle) => void;
  onInitialLayout: (layout: LayoutRectangle) => void;
};

const SectionTabs: FC<SectionTabsProps> = memo(
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

    const handleLayout = useCallback(
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
            <PressableOpacity
              key={index}
              onPress={() => onSelectSection?.(index)}
              style={[styles.container, { width: width / data.length }]}>
              <Text
                onLayout={({ nativeEvent: { layout } }) => {
                  handleLayout(index, layout);
                }}
                style={styles.title}
                numberOfLines={1}
                adjustsFontSizeToFit>
                {title}
              </Text>
            </PressableOpacity>
          );
        })}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  safeContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    flexDirection: 'row',
    left: 0,
    position: 'absolute',
    top: 0,
    zIndex: 5,
  },
  title: {
    color: '#000',
    fontSize: 17,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

export { SectionTabs };

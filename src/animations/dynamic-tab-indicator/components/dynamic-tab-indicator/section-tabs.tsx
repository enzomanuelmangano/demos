import React from 'react';
import type { LayoutRectangle } from 'react-native';
import { TouchableOpacity, StyleSheet, SafeAreaView, Text } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

type SectionTabsProps = {
  height: number;
  width: number;
  data: string[];
  indicatorLayout: Animated.SharedValue<LayoutRectangle>;
  layouts: Animated.SharedValue<LayoutRectangle[]>;
  onSelectSection?: (index: number) => void;
};

const SectionTabs: React.FC<SectionTabsProps> = React.memo(
  ({ height, width, data, indicatorLayout, layouts, onSelectSection }) => {
    const rIndicatorLayoutStyle = useAnimatedStyle(() => {
      return {
        position: 'absolute',
        top: indicatorLayout.value.y + height - 35,
        left: indicatorLayout.value.x,
        width: indicatorLayout.value.width,
        height: 2,
      };
    }, [height]);

    return (
      <SafeAreaView
        style={[
          {
            width,
            height,
          },
          styles.safeContainer,
        ]}>
        <Animated.View
          style={[
            {
              backgroundColor: 'black',
              zIndex: 10,
              borderRadius: 5,
            },
            rIndicatorLayoutStyle,
          ]}
        />
        {data.map((title, index) => {
          return (
            <TouchableOpacity
              onPress={() => {
                // Nice to have: scroll to the selected section on press.
                return onSelectSection?.(index);
              }}
              style={[styles.container, { width }]}
              key={index}>
              <Text
                // This is the crucial part.
                // Animating on the scroll event isn't enough if
                // we don't have the layout of each section title.
                // Here, we're solving this problem by using the onLayout event.
                onLayout={({ nativeEvent: { layout } }) => {
                  // First we update the layouts value.
                  layouts.value[index] = { ...layout };
                  layouts.value = [...layouts.value];

                  // Then if the index is 0, we update the indicatorLayout value.
                  // This is because we want the indicatorLayout value to be
                  // the layout of the first section title (at the first render).
                  if (index === 0) {
                    indicatorLayout.value = { ...layout };
                  }
                }}
                style={styles.title}>
                {title}
              </Text>
            </TouchableOpacity>
          );
        })}
      </SafeAreaView>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  // Very bad naming :)
  safeContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 5,
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255, 255,0.6)',
  },
});

export { SectionTabs };

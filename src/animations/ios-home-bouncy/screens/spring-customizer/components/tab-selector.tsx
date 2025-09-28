import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useLayoutEffect, useRef, useState } from 'react';

import Animated, {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
} from 'react-native-reanimated';

interface TabOption<T> {
  key: T;
  label: string;
}

interface TabSelectorProps<T extends string> {
  options: TabOption<T>[];
  selectedTab: T;
  onTabChange: (tab: T) => void;
}

export function TabSelector<T extends string>({
  options,
  selectedTab,
  onTabChange,
}: TabSelectorProps<T>) {
  const [tabWidth, setTabWidth] = useState(0);
  const containerRef = useRef<View>(null);

  const selectedIndex = options.findIndex(option => option.key === selectedTab);

  useLayoutEffect(() => {
    if (containerRef.current) {
      containerRef.current.measure((_, __, width) => {
        const calculatedTabWidth = width / options.length;
        setTabWidth(calculatedTabWidth);
      });
    }
  }, [options.length]);

  const indicatorPosition = useDerivedValue(() => {
    return withSpring(selectedIndex, {
      mass: 0.8,
      damping: 20,
      stiffness: 200,
    });
  });

  const indicatorStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateX: interpolate(
            indicatorPosition.value,
            [0, options.length - 1],
            [0, tabWidth * (options.length - 1)],
          ),
        },
      ],
    };
  });

  return (
    <View style={styles.tabContainer} ref={containerRef}>
      <Animated.View
        style={[styles.tabIndicator, indicatorStyle, { width: tabWidth }]}
      />
      {options.map(option => (
        <Pressable
          key={option.key}
          style={styles.tab}
          onPress={() => onTabChange(option.key)}>
          <Text
            style={[
              styles.tabText,
              selectedTab === option.key && styles.tabTextActive,
            ]}>
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tab: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 12,
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  tabContainer: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 16,
    elevation: 2,
    flexDirection: 'row',
    marginBottom: 12,
    position: 'relative',
    shadowColor: '#D1D5DB',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  tabIndicator: {
    backgroundColor: '#FFFFFF',
    borderCurve: 'continuous',
    borderRadius: 12,
    elevation: 3,
    height: 40,
    position: 'absolute',
    shadowColor: '#D1D5DB',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  tabText: {
    color: '#9CA3AF',
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  tabTextActive: {
    color: '#6B7280',
  },
});

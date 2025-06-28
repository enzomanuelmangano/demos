import React, { useState, useLayoutEffect, useRef } from 'react';
import { View, StyleSheet, Text, Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  interpolate,
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
  tabContainer: {
    flexDirection: 'row',
    borderRadius: 16,
    borderCurve: 'continuous',
    alignItems: 'center',
    marginBottom: 12,
    position: 'relative',
    shadowColor: '#D1D5DB',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  tabIndicator: {
    position: 'absolute',
    height: 40,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderCurve: 'continuous',
    shadowColor: '#D1D5DB',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderCurve: 'continuous',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'SF-Pro-Rounded-Bold',
    color: '#9CA3AF',
    letterSpacing: -0.3,
  },
  tabTextActive: {
    color: '#6B7280',
  },
});

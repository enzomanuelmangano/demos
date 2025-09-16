import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, Text } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

type ExpoRouterListItemProps = {
  item: {
    id: number;
    name: string;
    icon: () => React.JSX.Element;
    alert?: boolean;
  };
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

const ExpoRouterListItem: React.FC<ExpoRouterListItemProps> = React.memo(
  ({ item, onPress, style }) => {
    // Shared value for tracking touch progress
    const progress = useSharedValue(0);

    // Tap gesture configuration
    const tapGesture = Gesture.Tap()
      .onTouchesDown(() => {
        progress.value = withTiming(1, { duration: 100 });
      })
      .onTouchesUp(() => {
        if (onPress) runOnJS(onPress)();
      })
      .onFinalize(() => {
        progress.value = withTiming(0);
      })
      .maxDuration(10000);

    // Animated style based on touch progress
    const rStyle = useAnimatedStyle(() => {
      const opacity = interpolate(progress.value, [0, 1], [0, 0.1]).toFixed(2);
      const scale = interpolate(progress.value, [0, 1], [1, 0.95]);

      return {
        backgroundColor: `rgba(255,255,255,${opacity})`,
        transform: [{ scale }],
      };
    }, []);

    return (
      <GestureDetector gesture={tapGesture}>
        <Animated.View style={[styles.container, style, rStyle]}>
          <item.icon />
          <Text style={styles.text}>{item.name}</Text>
          {item.alert && <Text style={styles.alert}>⚠️</Text>}
        </Animated.View>
      </GestureDetector>
    );
  },
);

ExpoRouterListItem.displayName = 'ExpoRouterListItem';

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flex: 1,
  },
  text: {
    color: 'white',
    fontSize: 15,
    fontWeight: '500',
    marginLeft: 12,
    flex: 1,
  },
  alert: {
    fontSize: 16,
    marginLeft: 6,
  },
});

export { ExpoRouterListItem };

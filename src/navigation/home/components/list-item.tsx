import React from 'react';
import type { ViewToken } from 'react-native';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import type { Screens } from '../../screens';

type ListItemProps = {
  viewableItems: Animated.SharedValue<ViewToken[]>;
  item: (typeof Screens)[number];
  onPress: () => void;
};

const ListItem: React.FC<ListItemProps> = React.memo(
  ({ item, viewableItems, onPress }) => {
    const isActive = useSharedValue(false);

    const gesture = Gesture.Tap()
      .maxDuration(10000)
      .onTouchesDown(() => {
        isActive.value = true;
      })
      .onTouchesUp(() => {
        isActive.value = false;
        runOnJS(onPress)();
      })
      .onFinalize(() => {
        isActive.value = false;
      });

    const rStyle = useAnimatedStyle(() => {
      const isVisible = viewableItems.value.some(
        viewableItem => viewableItem.item.id === item.id,
      );

      // eslint-disable-next-line no-nested-ternary
      const scale = isVisible ? (isActive.value ? 0.95 : 1) : 0.6;

      return {
        opacity: withTiming(isVisible ? 1 : 0),
        transform: [
          {
            scale: withTiming(scale),
          },
        ],
      };
    }, []);

    return (
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.container, rStyle]}>
          <item.icon />
          <Text
            style={{
              fontSize: 16,
              fontWeight: '400',
              marginLeft: 10,
            }}>
            {item.name}
          </Text>
        </Animated.View>
      </GestureDetector>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    height: 80,
    backgroundColor: '#FFF',
    borderRadius: 10,
    shadowColor: '#000',
    elevation: 2,
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    flex: 1,
    marginHorizontal: 20,
    marginTop: 20,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
  },
});

export { ListItem };

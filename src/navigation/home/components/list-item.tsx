import React from 'react';
import type { StyleProp, ViewStyle, ViewToken } from 'react-native';
import { StyleSheet, Text } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import Animated, {
  FadeIn,
  FadeOutDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { PressableScale } from 'pressto';

import type { Screens } from '../../screens';

type ListItemProps = {
  viewableItems: SharedValue<ViewToken[]>;
  item: (typeof Screens)[number];
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

const ListItem: React.FC<ListItemProps> = React.memo(
  ({ item, viewableItems, onPress, style }) => {
    const isActive = useSharedValue(false);

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
      <Animated.View
        exiting={FadeOutDown.duration(500)}
        entering={FadeIn.duration(500)}>
        <PressableScale
          onPress={onPress}
          onPressIn={() => {
            isActive.value = true;
          }}
          onPressOut={() => {
            isActive.value = false;
          }}
          style={[styles.container, rStyle, style]}>
          <item.icon />
          <Text
            style={{
              fontSize: 16,
              marginLeft: 10,
              color: 'white',
              fontFamily: 'FiraCode-Regular',
            }}>
            {item.name}
          </Text>
        </PressableScale>
      </Animated.View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    height: 80,
    backgroundColor: '#1a1a1a',
    borderRadius: 15,
    borderCurve: 'continuous',
    shadowColor: '#000',
    elevation: 2,
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    flex: 1,
    marginHorizontal: 15,
    marginTop: 20,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
  },
});

export { ListItem };

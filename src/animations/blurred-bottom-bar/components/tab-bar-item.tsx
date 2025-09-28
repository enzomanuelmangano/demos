import { StyleSheet } from 'react-native';

import { type FC, memo, type ReactNode, useCallback } from 'react';

import { MaterialIcons } from '@expo/vector-icons';
import { PressableScale } from 'pressto';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';

type TabBarItemProps = {
  children?: ReactNode;
  onPress: () => void;
  focusedIndex: SharedValue<number>;
  index: number;
  screenName: string;
};

export const TabBarItem: FC<TabBarItemProps> = memo(
  ({ onPress, focusedIndex, index, screenName }) => {
    const isFocused = useDerivedValue(() => {
      return focusedIndex.value === index;
    }, [index]);

    const rStyle = useAnimatedStyle(() => {
      return {
        opacity: withTiming(isFocused.value ? 1 : 0.3),
      };
    }, []);

    const getIconByScreenName = useCallback((pageName: string) => {
      const iconMap: { [key: string]: string } = {
        home: 'home',
        explore: 'explore',
        camera: 'camera-alt',
        settings: 'settings',
      };

      const iconName = iconMap[pageName.toLowerCase()] || 'home';

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      return <MaterialIcons name={iconName} size={25} color={'white'} />;
    }, []);

    return (
      <Animated.View style={[localStyles.fill, rStyle]}>
        <PressableScale style={localStyles.fillCenter} onPress={onPress}>
          {getIconByScreenName(screenName)}
        </PressableScale>
      </Animated.View>
    );
  },
);

const localStyles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  fillCenter: { alignItems: 'center', flex: 1, justifyContent: 'center' },
});

import { ReactNode, type FC } from 'react';

import { PressableScale } from 'pressto';
import {
  type SharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

import type { StyleProp, ViewStyle } from 'react-native';

const AnimatedOpacityView: FC<{
  activeIndex: SharedValue<number>;
  index: number;
  onPress: () => void;
  style: StyleProp<ViewStyle>;
  children?: ReactNode;
}> = ({ index, activeIndex, style, onPress, ...viewProps }) => {
  const rStyle = useAnimatedStyle(() => {
    const opacity = withTiming(activeIndex.value === index ? 1 : 0.5);

    return {
      opacity,
    };
  }, [index]);

  return (
    <PressableScale onPress={onPress} style={[style, rStyle]} {...viewProps} />
  );
};

export { AnimatedOpacityView };

import { useCallback } from 'react';

import { useDerivedValue, withTiming } from 'react-native-reanimated';
import Touchable from 'react-native-skia-gesture';
import { scheduleOnRN } from 'react-native-worklets';

import { useAnimatedPathData } from './hooks/use-animated-path-data';

type ExclusionTabBoxProps = {
  tabs: readonly string[];
  index: number;
  activeIndex: number;
  onPress?: () => void;
  height: number;
  activeBackgroundColor: string;
  backgroundColor: string;
  horizontalTabsPadding: number;
  internalBoxPadding: number;
};

export const ExclusionTabBox: React.FC<ExclusionTabBoxProps> = ({
  tabs,
  index,
  activeIndex: activeTabIndex,
  onPress,
  height,
  activeBackgroundColor,
  backgroundColor,
  internalBoxPadding,
  horizontalTabsPadding,
}) => {
  const isActiveTab = index === activeTabIndex;
  const tab = tabs[index];

  const { skPath } = useAnimatedPathData({
    tabs,
    activeTabIndex,
    pathHeight: height,
    index,
    internalBoxPadding,
    horizontalTabsPadding,
  });

  const onTap = useCallback(() => {
    onPress?.();
  }, [onPress]);

  const color = useDerivedValue(() => {
    return withTiming(isActiveTab ? activeBackgroundColor : backgroundColor, {
      duration: 150,
    });
  }, [isActiveTab]);

  return (
    // I'm using the Touchable.Path component to detect the touch event
    // The Path is the shape of the tab box and it's the only area that will trigger the touch event
    // The Touchable Path supports multiple callbacks like onEnd, onStart, onActive
    // I'm using the onEnd callback to trigger the onPress function
    // but since the onPress function is not a worklet function I need to wrap it with runOnJS
    <Touchable.Path
      onTap={() => {
        'worklet';
        scheduleOnRN(onTap);
      }}
      key={tab}
      path={skPath}
      color={color}
    />
  );
};

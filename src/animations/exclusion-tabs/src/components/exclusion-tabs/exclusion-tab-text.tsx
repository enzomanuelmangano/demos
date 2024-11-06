import { Group, Text } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';

import { font } from '../../constants';

import { useAnimatedPathData } from './hooks/use-animated-path-data';

type ExclusionTabTextProps = {
  tabs: readonly string[];
  activeTabIndex: number;
  index: number;
  height: number;
  horizontalTabsPadding: number;
  internalBoxPadding: number;
};

export const ExclusionTabText: React.FC<ExclusionTabTextProps> = ({
  tabs,
  activeTabIndex,
  index,
  height,
  horizontalTabsPadding,
  internalBoxPadding,
}) => {
  const text = tabs[index];

  const { skPath } = useAnimatedPathData({
    tabs,
    activeTabIndex,
    pathHeight: height,
    index,
    internalBoxPadding,
    horizontalTabsPadding,
  });

  const transform = useDerivedValue(() => {
    const bounds = skPath.value.getBounds();

    return [
      {
        translateX: bounds.x + internalBoxPadding,
      },
      {
        translateY: bounds.y + height / 2 + font.getSize() / 3,
      },
    ];
  }, []);

  return (
    <Group>
      <Text text={text} font={font} color={'#FFFFFF'} transform={transform} />
    </Group>
  );
};

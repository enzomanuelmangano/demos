import { useDerivedValue } from 'react-native-reanimated';
import { Group, Text } from 'react-native-skia';

import { font } from '../../constants';
import { useAnimatedBoxX } from './hooks/use-animated-path-data';

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

  // Same x as the box path bounds (the box's y is always 0)
  const { boxX } = useAnimatedBoxX({
    tabs,
    activeTabIndex,
    index,
    internalBoxPadding,
    horizontalTabsPadding,
  });

  const transform = useDerivedValue(() => {
    return [
      {
        translateX: boxX.get() + internalBoxPadding,
      },
      {
        translateY: height / 2 + font.getSize() / 3,
      },
    ];
  }, []);

  return (
    <Group>
      <Text text={text} font={font} color={'#FFFFFF'} transform={transform} />
    </Group>
  );
};

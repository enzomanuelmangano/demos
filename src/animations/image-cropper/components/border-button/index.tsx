import { Text } from 'react-native';

import { PressableScale } from 'pressto';

type FancyBorderButtonProps = {
  onPress: () => void;
  title: string;
};

const FancyBorderButton: React.FC<FancyBorderButtonProps> = ({
  onPress,
  title,
}) => {
  return (
    <PressableScale
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderColor: 'white',
        padding: 16,
        borderRadius: 8,
        borderCurve: 'continuous',
      }}>
      <Text
        style={{
          color: 'white',
          letterSpacing: 1,
        }}>
        {title}
      </Text>
    </PressableScale>
  );
};

export { FancyBorderButton };

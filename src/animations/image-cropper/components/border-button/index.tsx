import { Text, TouchableOpacity } from 'react-native';

type FancyBorderButtonProps = {
  onPress: () => void;
  title: string;
};

const FancyBorderButton: React.FC<FancyBorderButtonProps> = ({
  onPress,
  title,
}) => {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderColor: 'white',
        padding: 16,
        borderRadius: 8,
      }}>
      <Text
        style={{
          color: 'white',
          letterSpacing: 1,
        }}>
        {title}
      </Text>
    </TouchableOpacity>
  );
};

export { FancyBorderButton };

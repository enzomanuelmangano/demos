import {
  ColorValue,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { type FC } from 'react';

import { LinearGradient } from 'expo-linear-gradient';
import { PressableScale } from 'pressto';

type BottomSheetPageProps = {
  onPress?: () => void;
  gradientColors?: [ColorValue, ColorValue, ...ColorValue[]];
  buttonTitle?: string;
};

const BottomSheetPage: FC<BottomSheetPageProps> = ({
  onPress,
  gradientColors = ['#4E65FF', '#92EFFD'] as const,
  buttonTitle = 'Tap Here',
}) => {
  const { width: windowWidth } = useWindowDimensions();

  return (
    <View
      style={[
        styles.container,
        {
          width: windowWidth,
        },
      ]}>
      <PressableScale onPress={onPress}>
        <LinearGradient
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
          colors={gradientColors}
          style={styles.button}>
          <Text style={styles.buttonText}>{buttonTitle}</Text>
        </LinearGradient>
      </PressableScale>
    </View>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: 40,
    height: 50,
    justifyContent: 'center',
    width: 200,
  },
  buttonText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export { BottomSheetPage };

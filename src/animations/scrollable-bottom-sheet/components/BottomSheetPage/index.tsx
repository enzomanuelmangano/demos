import { LinearGradient } from 'expo-linear-gradient';
import { PressableScale } from 'pressto';
import React from 'react';
import {
  ColorValue,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

type BottomSheetPageProps = {
  onPress?: () => void;
  gradientColors?: [ColorValue, ColorValue, ...ColorValue[]];
  buttonTitle?: string;
};

const BottomSheetPage: React.FC<BottomSheetPageProps> = ({
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
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  button: {
    height: 50,
    width: 200,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
});

export { BottomSheetPage };

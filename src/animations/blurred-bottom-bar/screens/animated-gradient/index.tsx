import {
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { FontAwesome } from '@expo/vector-icons';
import { Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import {
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';

import { getRandomColor } from './utils';

const AnimatedGradient = () => {
  const { width, height } = useWindowDimensions();

  const leftColor = useSharedValue('red');
  const rightColor = useSharedValue('blue');

  const colors = useDerivedValue(() => {
    return [leftColor.value, rightColor.value];
  }, []);

  const safeBottomBarHeight = useBottomTabBarHeight();

  return (
    <>
      <StatusBar style="light" />
      <Canvas style={{ flex: 1 }}>
        <Rect x={0} y={0} width={width} height={height}>
          <LinearGradient
            start={vec(0, 0)}
            end={vec(width, height)}
            colors={colors}
          />
        </Rect>
      </Canvas>
      <TouchableOpacity
        style={[
          styles.buttonContainer,
          {
            bottom: safeBottomBarHeight + 60,
            right: '15%',
          },
        ]}
        onPress={() => {
          leftColor.value = withTiming(getRandomColor());
          rightColor.value = withTiming(getRandomColor());
        }}>
        <FontAwesome name="random" size={24} color="white" />
      </TouchableOpacity>
    </>
  );
};

const styles = StyleSheet.create({
  buttonContainer: {
    position: 'absolute',
    height: 64,
    aspectRatio: 1,
    borderRadius: 40,
    backgroundColor: '#111',
    zIndex: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export { AnimatedGradient };

import { StyleSheet, View } from 'react-native';

import { Image } from 'expo-image';
import Animated, {
  Extrapolation,
  interpolate,
  SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';

type OnboardingPageProps = {
  image: ReturnType<typeof require>;
  title: string;
  index: number;
  currentOffset: SharedValue<number>;
  width: number;
  height: number;
};

const OnboardingPage: React.FC<OnboardingPageProps> = ({
  image,
  title,
  index,
  currentOffset,
  width,
  height,
}) => {
  const inputRange = [(index - 1) * width, index * width, (index + 1) * width];

  const rBadgeStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(currentOffset.value, inputRange, [
      Math.PI / 4,
      Math.PI * 2,
      Math.PI / 4,
    ]);
    const scale = interpolate(currentOffset.value, inputRange, [0.5, 1, 0.5]);

    return {
      transform: [
        {
          rotateY: `${rotateY}rad`,
        },
        {
          scale: scale,
        },
      ],
    };
  }, []);

  const rTitleStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      currentOffset.value,
      inputRange,
      [-1, 1, -1],
      Extrapolation.CLAMP,
    );

    return {
      opacity,
    };
  }, []);

  return (
    <View key={index} style={[styles.container, { width, height }]}>
      <Animated.View
        style={[
          styles.badge,
          rBadgeStyle,
          {
            width: width * 0.6,
            borderRadius: width * 0.3,
            borderCurve: 'continuous',
          },
        ]}>
        <Image source={image} style={styles.image} />
      </Animated.View>
      <Animated.Text style={[styles.title, rTitleStyle]}>{title}</Animated.Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    aspectRatio: 1,
    backgroundColor: 'white',
    overflow: 'hidden',
    padding: 10,
  },
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    borderCurve: 'continuous',
    borderRadius: 400,
    flex: 1,
  },
  title: {
    color: 'white',
    fontSize: 40,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginHorizontal: 40,
    marginTop: 50,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
});

export { OnboardingPage };

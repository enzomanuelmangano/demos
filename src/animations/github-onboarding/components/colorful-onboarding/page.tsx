import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
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
          { width: width * 0.6, borderRadius: width * 0.3 },
        ]}>
        <Image source={image} style={styles.image} />
      </Animated.View>
      <Animated.Text style={[styles.title, rTitleStyle]}>{title}</Animated.Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    aspectRatio: 1,
    backgroundColor: 'white',
    overflow: 'hidden',
    padding: 10,
  },
  image: {
    flex: 1,
    borderRadius: 400,
  },
  title: {
    fontSize: 40,
    fontWeight: 'bold',
    color: 'white',
    marginTop: 50,
    marginHorizontal: 40,
    letterSpacing: 1,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
});

export { OnboardingPage };

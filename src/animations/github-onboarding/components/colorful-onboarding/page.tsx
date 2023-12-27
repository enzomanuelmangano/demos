// Imports from libraries
import { Image } from 'expo-image';
import { View, StyleSheet } from 'react-native';
import Animated, {
  Extrapolate,
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';

// Type definitions for the OnboardingPage component props
type OnboardingPageProps = {
  image: ReturnType<typeof require>;
  title: string;
  index: number;
  currentOffset: Animated.SharedValue<number>;
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
  // Calculate input range based on page index and width
  const inputRange = [(index - 1) * width, index * width, (index + 1) * width];

  // Create the animated style for the badge
  const rBadgeStyle = useAnimatedStyle(() => {
    // Calculate rotation and scaling based on current page offset
    // Play with these values to get different effects!!
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

  // Create the animated style for the title
  const rTitleStyle = useAnimatedStyle(() => {
    // Calculate opacity based on current page offset
    const opacity = interpolate(
      currentOffset.value,
      inputRange,
      [-1, 1, -1],
      Extrapolate.CLAMP,
    );

    return {
      opacity,
    };
  }, []);

  // Render the Onboarding page
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

// StyleSheet for the static styles
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
    borderRadius: 400, // Adjusting the borderRadius to a fixed value
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

// Export the OnboardingPage component
export { OnboardingPage };

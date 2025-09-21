import { Image, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { use3DRotationStyle } from './hooks/use-3d-rotation-style';

const CARD_SIZE = 300;
const MAX_CARD_ROTATE_DEG = 18;

const delayedSpringConfig = {
  stiffness: 100,
  damping: 10,
  mass: 1,
};

export const Animated3DParallax = () => {
  const touchX = useSharedValue(CARD_SIZE / 2);
  const touchY = useSharedValue(CARD_SIZE / 2);

  const gesture = Gesture.Pan()
    // That's up to you to decide if you want to cancel the gesture when the user is outside the card
    // .shouldCancelWhenOutside(true)
    .onBegin(({ x, y }) => {
      // I like to catch the interaction from the first touch,
      // That's why I set the value of the shared values also here (in the onBegin callback)
      touchX.value = x;
      touchY.value = y;
    })
    .onUpdate(({ x, y }) => {
      touchX.value = x;
      touchY.value = y;
    })
    .onFinalize(() => {
      touchX.value = CARD_SIZE / 2;
      touchY.value = CARD_SIZE / 2;
    });

  const touchCardX = useDerivedValue(() => {
    return withSpring(touchX.value);
  });

  const touchCardY = useDerivedValue(() => {
    return withSpring(touchY.value);
  });

  // The trick is to delay the animation of the content
  // So it will seem like the content is animating with a "Parallax effect"
  // Instead of delaying the animation of the card with the "withDelay" High Order Function
  // I prefer to delay the animation of the content by using different options for the "withSpring" function:
  // In my case I use a "stiffness" of 80 and a "mass" of 2 (but you can play with these values to get the best result)
  const touchCardContentX = useDerivedValue(() => {
    return withSpring(touchX.value, delayedSpringConfig);
  });

  const touchCardContentY = useDerivedValue(() => {
    return withSpring(touchY.value, delayedSpringConfig);
  });

  const { rRotationStyle: rStyle } = use3DRotationStyle({
    x: touchCardX,
    y: touchCardY,
    maxSize: CARD_SIZE,
    maxRotation: MAX_CARD_ROTATE_DEG,
  });

  const { rRotationStyle: rContentStyle } = use3DRotationStyle({
    x: touchCardContentX,
    y: touchCardContentY,
    maxSize: CARD_SIZE,
    maxRotation: MAX_CARD_ROTATE_DEG,
    perspective: 500,
  });

  return (
    <View style={styles.container}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={styles.cardContainer}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              styles.card,
              styles.cardShadow,
              rStyle,
            ]}
          />
          <Animated.View
            style={[
              styles.cardContent,
              rContentStyle,
              {
                transformOrigin: ['50%', '50%', 100],
              },
            ]}>
            <Image
              source={require('./assets/logo.png')}
              style={{
                height: 200,
                aspectRatio: 1,
              }}
              resizeMode="contain"
            />
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#17202A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContainer: {
    height: CARD_SIZE,
    width: CARD_SIZE,
  },
  card: {
    backgroundColor: '#1E2731',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 5,
    // Using transformOrigin instead of zIndex for proper 3D layering
  },
  cardShadow: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 10,
  },
});

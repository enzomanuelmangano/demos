import { StyleSheet, Text, View } from 'react-native';

import { useCallback, useRef, useState } from 'react';

import { AntDesign } from '@expo/vector-icons';
import { PressableScale } from 'pressto';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedReaction,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { SwipeableCard } from './components/Card';
import { IMAGES } from './constants';
import { useSwipeControls } from './hooks/use-swipe-controls';

export const SwipeCards = () => {
  const { activeIndex, refs, swipeRight, swipeLeft, reset } =
    useSwipeControls();

  const liked = useRef(0);
  const disliked = useRef(0);

  // e2e outcome probe: exposes how many cards have been swiped away as an
  // assertable token so a test can verify the swipe buttons actually advanced
  // the deck (the cards themselves are Skia/animated and expose no state).
  // Visually negligible (alpha ~0.01).
  const [swipedCount, setSwipedCount] = useState(0);
  useAnimatedReaction(
    () => activeIndex.get(),
    current => {
      scheduleOnRN(setSwipedCount, current);
    },
  );

  const onReset = useCallback(() => {
    activeIndex.set(0);
    liked.current = 0;
    disliked.current = 0;

    reset();
  }, [activeIndex, reset]);

  return (
    <View style={styles.container}>
      <Text testID="swipe-cards-status" style={styles.statusProbe}>
        {`swiped:${swipedCount}`}
      </Text>
      <View style={{ flex: 7 }}>
        <Animated.View
          style={{
            marginTop: 20,
            justifyContent: 'center',
            alignItems: 'center',
            flex: 1,
          }}
          entering={FadeIn}
          exiting={FadeOut}>
          {new Array(IMAGES.length).fill(0).map((_, index) => {
            return (
              <SwipeableCard
                key={index}
                index={index}
                activeIndex={activeIndex}
                image={IMAGES[index]}
                ref={refs[index]}
                onSwipeRight={() => {
                  liked.current += 1;
                }}
                onSwipeLeft={() => {
                  disliked.current += 1;
                }}
              />
            );
          })}
        </Animated.View>
      </View>

      {/* Define the buttons container */}
      <View style={styles.buttonsContainer}>
        <PressableScale
          testID="swipe-cards-dislike"
          style={styles.button}
          onPress={swipeLeft}>
          <AntDesign name="close" size={32} color="white" />
        </PressableScale>
        <PressableScale
          testID="swipe-cards-reset"
          style={[styles.button, { height: 60, marginHorizontal: 10 }]}
          onPress={onReset}>
          <AntDesign name="reload" size={24} color="white" />
        </PressableScale>
        <PressableScale
          testID="swipe-cards-like"
          style={styles.button}
          onPress={swipeRight}>
          <AntDesign name="heart" size={32} color="white" />
        </PressableScale>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    aspectRatio: 1,
    backgroundColor: '#3A3D45',
    borderRadius: 40,
    boxShadow: '0px 4px 0px rgba(0, 0, 0, 0.1)',
    height: 80,
    justifyContent: 'center',
    marginHorizontal: 20,
  },
  buttonsContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    flex: 2,
    justifyContent: 'center',
  },
  container: {
    backgroundColor: '#242831',
    flex: 1,
  },
  statusProbe: {
    color: '#242831',
    fontSize: 1,
    left: 0,
    opacity: 0.012,
    position: 'absolute',
    top: 0,
    zIndex: 1000,
  },
});

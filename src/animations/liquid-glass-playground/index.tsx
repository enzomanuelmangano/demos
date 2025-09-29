import { StyleSheet, View } from 'react-native';

import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, withSpring } from 'react-native-reanimated';

import { Overlay } from './overlay';

const image = {
  uri: 'https://images.unsplash.com/photo-1592330169142-b488cfd72b2b?q=80&w=2832&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
};

export function Playground() {
  const translateY = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .onUpdate(event => {
      const friction = 0.5;
      translateY.value = event.translationY * friction;
    })
    .onEnd(() => {
      translateY.value = withSpring(0, {
        duration: 600,
        dampingRatio: 1,
      });
    });

  return (
    <View style={styles.container}>
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            styles.glassView,
            {
              transform: [{ translateY }],
            },
          ]}>
          <Overlay style={styles.glassView} />
        </Animated.View>
      </GestureDetector>
      <Image
        source={image}
        contentFit="cover"
        style={{
          width: '100%',
          height: '100%',
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  glassView: {
    ...StyleSheet.absoluteFillObject,
    borderCurve: 'continuous',
    borderRadius: 50,
    height: '100%',
    overflow: 'hidden',
    width: '100%',
    zIndex: 2,
  },
});

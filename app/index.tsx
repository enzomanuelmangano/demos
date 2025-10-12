import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { useCallback, useRef } from 'react';

import { useFocusEffect } from 'expo-router';
import { Drawer } from 'expo-router/drawer';

import {
  StaggeredText,
  StaggeredTextRef,
} from '../src/animations/everybody-can-cook/components/staggered-text';
import { AnimatedHamburgerIcon } from '../src/navigation/components/animated-hamburger-icon';

const baseDrawerOptions = {
  headerShown: true,
  headerTransparent: true,
  headerStyle: {
    backgroundColor: 'transparent',
  },
  title: 'Demos',
  headerTintColor: 'white',
  headerTitleStyle: {
    color: 'white',
  },
};

export default function HomeScreen() {
  const { width: windowWidth } = useWindowDimensions();

  const staggeredTextRef = useRef<StaggeredTextRef>(null);

  useFocusEffect(
    useCallback(() => {
      setTimeout(() => {
        staggeredTextRef.current?.reset();
        staggeredTextRef.current?.animate();
      }, 500);
    }, []),
  );

  return (
    <>
      <Drawer.Screen
        options={{
          ...baseDrawerOptions,
          swipeEdgeWidth: windowWidth * 0.35,
          swipeEnabled: true,
          swipeMinDistance: 40,
          headerLeft: () => (
            <View style={{ paddingLeft: 16 }}>
              <AnimatedHamburgerIcon />
            </View>
          ),
        }}
      />
      <View
        style={styles.container}
        onTouchEnd={() => {
          staggeredTextRef.current?.toggleAnimate();
        }}>
        <StaggeredText
          ref={staggeredTextRef}
          textStyle={styles.title}
          enableReverse
          text="Swipe to explore."
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: 'black',
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    color: 'white',
    fontFamily: 'honk-regular',
    fontSize: 24,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: 24,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
});

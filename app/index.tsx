import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import React, { useCallback, useRef } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { StaggeredTextRef } from '../src/animations/everybody-can-cook/components/staggered-text';
import { AnimatedHamburgerIcon } from '../src/components/animated-hamburger-icon';
import LiquidButton from '../src/components/LiquidButton/LiquidButton';

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
  const navigation = useNavigation();
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
              <AnimatedHamburgerIcon
                tintColor="white"
                onPress={() => (navigation as any).toggleDrawer()}
              />
            </View>
          ),
        }}
      />
      <View style={styles.container}>
        <LiquidButton title="Liquid Glass Button" onPress={() => {}} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 24,
    fontFamily: 'honk-regular',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});

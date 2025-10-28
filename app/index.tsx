import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { useCallback, useRef } from 'react';

import { DrawerActions, useNavigation } from '@react-navigation/native';
import { useFocusEffect } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { PressableScale, PressableWithoutFeedback } from 'pressto';

import {
  StaggeredText,
  StaggeredTextRef,
} from '../src/animations/everybody-can-cook/components/staggered-text';
import { AnimatedDrawerIcon } from '../src/navigation/components/animated-drawer-icon';
import { useOnShakeEffect } from '../src/navigation/hooks/use-shake-gesture';
import { useRetray } from '../src/packages/retray';
import { Trays } from '../src/trays';

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
  const navigation = useNavigation();

  const staggeredTextRef = useRef<StaggeredTextRef>(null);

  const { show } = useRetray<Trays>();
  const handleFeedback = useCallback(() => {
    show('help');
  }, [show]);

  const handleOpenDrawer = useCallback(() => {
    navigation.dispatch(DrawerActions.openDrawer());
  }, [navigation]);

  useOnShakeEffect(handleFeedback);

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
              <AnimatedDrawerIcon />
            </View>
          ),
        }}
      />
      <PressableWithoutFeedback
        style={styles.container}
        onPress={() => {
          staggeredTextRef.current?.toggleAnimate();
        }}>
        <StaggeredText
          ref={staggeredTextRef}
          textStyle={styles.title}
          enableReverse
          text="Shake me."
        />
      </PressableWithoutFeedback>
      <PressableScale style={styles.floatingButton} onPress={handleOpenDrawer}>
        <View style={styles.floatingButtonInner}>
          <AnimatedDrawerIcon />
        </View>
      </PressableScale>
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
  floatingButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderCurve: 'continuous',
    borderRadius: 30,
    bottom: 32,
    boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.3)',
    elevation: 8,
    position: 'absolute',
    right: 32,
  },
  floatingButtonInner: {
    alignItems: 'center',
    height: 60,
    justifyContent: 'center',
    width: 60,
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

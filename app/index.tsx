import { Drawer } from 'expo-router/drawer';
import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AnimatedHamburgerIcon } from '../src/components/animated-hamburger-icon';

export default function HomeScreen() {
  const navigation = useNavigation();

  return (
    <>
      <Drawer.Screen
        options={{
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
          headerLeft: () => (
            <AnimatedHamburgerIcon
              tintColor="white"
              onPress={() => (navigation as any).toggleDrawer()}
            />
          ),
        }}
      />

      <View style={styles.container}></View>
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
});

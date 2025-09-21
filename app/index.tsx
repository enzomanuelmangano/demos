import { useNavigation } from '@react-navigation/native';
import { Drawer } from 'expo-router/drawer';
import React from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
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
          swipeEdgeWidth: Dimensions.get('window').width * 0.35,
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
      <View style={styles.container} />
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

import { Drawer } from 'expo-router/drawer';
import React from 'react';
import { StyleSheet, View } from 'react-native';

export default function HomeScreen() {
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

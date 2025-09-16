import { Drawer } from 'expo-router/drawer';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function HomeScreen() {
  return (
    <>
      <Drawer.Screen
        options={{
          headerShown: true,
          headerTransparent: true,
          headerBlurEffect: 'systemThinMaterialDark',
          headerStyle: {
            backgroundColor: 'transparent',
          },
          title: 'Welcome',
          headerTitleStyle: {
            color: 'white',
          },
        }}
      />

      <View style={styles.container}>
        <Text style={styles.title}>Welcome to Demos</Text>
        <Text style={styles.subtitle}>
          Swipe from the left edge or tap the menu button to browse all
          available animations
        </Text>
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
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#ccc',
    textAlign: 'center',
    lineHeight: 24,
  },
});

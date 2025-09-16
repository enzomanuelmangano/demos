import { createDrawerNavigator } from '@react-navigation/drawer';
import { NavigationContainer } from '@react-navigation/native';
import React from 'react';
import { StatusBar } from 'react-native';

import { CustomDrawerContent } from '../../src/components/custom-drawer-content';
import { AnimationScreen } from './animation-screen';
import { HomeScreen } from './home-screen';

const Drawer = createDrawerNavigator();

export function AppDrawer() {
  return (
    <NavigationContainer>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <Drawer.Navigator
        drawerContent={CustomDrawerContent}
        screenOptions={{
          headerShown: false,
          drawerStyle: {
            backgroundColor: '#000',
            width: 300,
          },
          drawerActiveTintColor: '#fff',
          drawerInactiveTintColor: '#666',
          drawerLabelStyle: {
            fontSize: 16,
            fontWeight: '500',
          },
          overlayColor: 'rgba(0, 0, 0, 0.5)',
        }}>
        <Drawer.Screen
          name="Home"
          component={HomeScreen}
          options={{
            drawerLabel: 'Home',
            title: 'Home',
          }}
        />
        <Drawer.Screen
          name="Animation"
          component={AnimationScreen}
          options={{
            drawerLabel: () => null, // Hide from drawer menu
            title: 'Animation',
          }}
        />
      </Drawer.Navigator>
    </NavigationContainer>
  );
}

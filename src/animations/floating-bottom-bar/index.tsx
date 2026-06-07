import { View } from 'react-native';

import { useCallback } from 'react';

// SDK 56: expo-router vendors its own react-navigation, so this demo's
// standalone navigator can no longer nest into the router's container —
// it runs as an independent tree instead.
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  DefaultTheme,
  NavigationContainer,
  NavigationIndependentTree,
} from '@react-navigation/native';

import { BottomTabBar } from './components/bottom-tab-bar';
import { ScreenNames } from './constants/screens';

import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

const BottomTab = createBottomTabNavigator();

export const FloatingBottomBar = () => {
  const tabBar = useCallback((props: BottomTabBarProps) => {
    return <BottomTabBar {...props} />;
  }, []);

  return (
    <NavigationIndependentTree>
      <NavigationContainer theme={DefaultTheme}>
        <BottomTab.Navigator tabBar={tabBar}>
          <BottomTab.Screen name={ScreenNames.Home} component={View} />
          <BottomTab.Screen name={ScreenNames.Bookmark} component={View} />
          <BottomTab.Screen name={ScreenNames.Add} component={View} />
          <BottomTab.Screen name={ScreenNames.Profile} component={View} />
          <BottomTab.Screen name={ScreenNames.Settings} component={View} />
        </BottomTab.Navigator>
      </NavigationContainer>
    </NavigationIndependentTree>
  );
};

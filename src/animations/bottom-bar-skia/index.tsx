import { View } from 'react-native';

import { useCallback } from 'react';

// SDK 56: expo-router vendors its own react-navigation, so this demo's
// standalone navigator can no longer nest into the router's container —
// it runs as an independent tree instead.
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  DarkTheme,
  NavigationContainer,
  NavigationIndependentTree,
} from '@react-navigation/native';

import { BottomTabBar } from './components/bottom-tab-bar';
import { ScreenNames } from './constants/screens';

import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

const BottomTab = createBottomTabNavigator();

const BackgroundView = () => {
  return <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.1)' }} />;
};

const BottomBarSkia = () => {
  const tabBar = useCallback((props: BottomTabBarProps) => {
    return <BottomTabBar {...props} />;
  }, []);

  return (
    <NavigationIndependentTree>
      <NavigationContainer theme={DarkTheme}>
        <BottomTab.Navigator tabBar={tabBar}>
          <BottomTab.Screen
            name={ScreenNames.Home}
            component={BackgroundView}
          />
          <BottomTab.Screen
            name={ScreenNames.Search}
            component={BackgroundView}
          />
          <BottomTab.Screen
            name={ScreenNames.User}
            component={BackgroundView}
          />
        </BottomTab.Navigator>
      </NavigationContainer>
    </NavigationIndependentTree>
  );
};

export { BottomBarSkia };

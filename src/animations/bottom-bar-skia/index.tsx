import { View } from 'react-native';

import { useCallback } from 'react';

import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

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
    <BottomTab.Navigator tabBar={tabBar}>
      <BottomTab.Screen name={ScreenNames.Home} component={BackgroundView} />
      <BottomTab.Screen name={ScreenNames.Search} component={BackgroundView} />
      <BottomTab.Screen name={ScreenNames.User} component={BackgroundView} />
    </BottomTab.Navigator>
  );
};

export { BottomBarSkia };

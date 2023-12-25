import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View } from 'react-native';
import { useCallback } from 'react';

import { BottomTabBar } from './components/bottom-tab-bar';
import { ScreenNames } from './constants/screens';

const BottomTab = createBottomTabNavigator();

export const FloatingBottomBar = () => {
  const tabBar = useCallback((props: any) => {
    return <BottomTabBar {...props} />;
  }, []);

  return (
    <BottomTab.Navigator tabBar={tabBar}>
      <BottomTab.Screen name={ScreenNames.Home} component={View} />
      <BottomTab.Screen name={ScreenNames.Bookmark} component={View} />
      <BottomTab.Screen name={ScreenNames.Add} component={View} />
      <BottomTab.Screen name={ScreenNames.Profile} component={View} />
      <BottomTab.Screen name={ScreenNames.Settings} component={View} />
    </BottomTab.Navigator>
  );
};

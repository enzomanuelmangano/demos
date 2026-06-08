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

import { Screen } from '../components/navigation';
import { TabBar } from '../components/navigation/bottom-tab-bar';

import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

const Tab = createBottomTabNavigator();

const DefaultScreen = () => <Screen title="Demo" />;

export function Navigation() {
  const tabBar = useCallback(
    (props: BottomTabBarProps) => (
      <TabBar
        onTabPress={(routeName: string) => {
          props.navigation.navigate(routeName);
        }}
      />
    ),
    [],
  );

  return (
    <NavigationIndependentTree>
      <NavigationContainer theme={DefaultTheme}>
        <Tab.Navigator
          tabBar={tabBar}
          screenOptions={{
            headerShown: false,
          }}>
          <Tab.Screen name="home" component={DefaultScreen} />
          <Tab.Screen name="search" component={DefaultScreen} />
          <Tab.Screen name="edit" component={DefaultScreen} />
          <Tab.Screen name="settings" component={DefaultScreen} />
        </Tab.Navigator>
      </NavigationContainer>
    </NavigationIndependentTree>
  );
}

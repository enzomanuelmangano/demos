import { useCallback, useEffect } from 'react';

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
import { IsTabBarActive } from './components/bottom-tab-bar/states';
import { ScreenNamesArray } from './constants/screens';
import { ScrollableGradients } from './screens/scrollable-gradients';

import type { ScreenNames } from './constants/screens';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

const BottomTab = createBottomTabNavigator();

const ScreenMap: Record<keyof typeof ScreenNames, React.FC> =
  ScreenNamesArray.reduce(
    (acc, key) => ({
      ...acc,
      [key]: key === 'home' ? ScrollableGradients : () => null,
    }),
    {} as Record<keyof typeof ScreenNames, React.FC>,
  );

export const App = () => {
  const renderTabBar = useCallback(
    (props: BottomTabBarProps) => <BottomTabBar {...props} />,
    [],
  );

  // IsTabBarActive is module-level, so it outlives the demo: without the
  // reset, a demo closed while scrolled reopens with the collapsed pill.
  useEffect(() => {
    return () => {
      IsTabBarActive.set(true);
    };
  }, []);

  return (
    <NavigationIndependentTree>
      <NavigationContainer theme={DefaultTheme}>
        <BottomTab.Navigator
          initialRouteName="home"
          screenOptions={{
            headerShown: false,
          }}
          tabBar={renderTabBar}>
          {ScreenNamesArray.map(screenName => (
            <BottomTab.Screen
              key={screenName}
              name={screenName}
              component={ScreenMap[screenName]}
              options={{ freezeOnBlur: true }}
            />
          ))}
        </BottomTab.Navigator>
      </NavigationContainer>
    </NavigationIndependentTree>
  );
};

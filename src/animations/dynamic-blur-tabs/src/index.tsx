import { useCallback } from 'react';

import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { BottomTabBar } from './components/bottom-tab-bar';
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

  return (
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
  );
};

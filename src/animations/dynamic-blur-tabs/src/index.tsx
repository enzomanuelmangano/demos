import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useCallback } from 'react';

import { BottomTabBar } from './components/bottom-tab-bar';
import type { ScreenNames } from './constants/screens';
import { ScreenNamesArray } from './constants/screens';
import { ScrollableGradients } from './screens/scrollable-gradients';

const BottomTab = createBottomTabNavigator();

// Create a map of screen names to components
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

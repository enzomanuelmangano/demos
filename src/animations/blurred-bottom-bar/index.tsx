import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useCallback } from 'react';

import { BottomTabBar } from './components/bottom-tab-bar';
import type { ScreenNames } from './constants/screens';
import { ScreenNamesArray } from './constants/screens';
import { Home } from './screens/home';
import { BlurredScroll } from './screens/blur';
import { AnimatedGradient } from './screens/animated-gradient';
import { ScrollableImages } from './screens/scrollable-images';

const BottomTab = createBottomTabNavigator();

const ScreenMap: Record<keyof typeof ScreenNames, () => React.ReactNode> = {
  Home: Home,
  'View-List': ScrollableImages,
  'Blur-On': BlurredScroll,
  Gradient: AnimatedGradient,
};

const App = () => {
  const tabBar = useCallback((props: BottomTabBarProps) => {
    return <BottomTabBar {...props} />;
  }, []);

  return (
    <BottomTab.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerShown: false,
      }}
      tabBar={tabBar}>
      {ScreenNamesArray.map(key => {
        return (
          <BottomTab.Screen
            key={key}
            name={key}
            component={ScreenMap[key]}
            options={{
              freezeOnBlur: true,
            }}
          />
        );
      })}
    </BottomTab.Navigator>
  );
};

export { App as BlurredBottomBar };

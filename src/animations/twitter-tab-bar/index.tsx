import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { View } from 'react-native';

import { BottomTabBar } from './components/bottom-tab-bar';
import { ActiveTabBarContextProvider } from './components/bottom-tab-bar/active-tab-bar-provider';
import { Palette } from './constants/palette';
import type { ScreenNames } from './constants/screens';
import { ScreenNamesArray } from './constants/screens';
import { HomeScreen } from './screens/home';

const BottomTab = createBottomTabNavigator();

const BackgroundView = () => {
  return <View style={{ flex: 1 }} />;
};

const ScreenMap: Record<keyof typeof ScreenNames, () => React.ReactNode> = {
  Home: HomeScreen,
  Search: BackgroundView,
  Notifications: BackgroundView,
  Message: BackgroundView,
};

const AppTheme: typeof DefaultTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: Palette.background,
    text: Palette.text,
    border: Palette.text,
    card: Palette.card,
  },
};

export const TwitterTabBar = () => {
  return (
    <NavigationContainer theme={AppTheme}>
      <ActiveTabBarContextProvider>
        <BottomTab.Navigator
          // eslint-disable-next-line react/no-unstable-nested-components
          tabBar={props => {
            return <BottomTabBar {...props} />;
          }}>
          {ScreenNamesArray.map(key => {
            return (
              <BottomTab.Screen
                key={key}
                name={key}
                component={ScreenMap[key]}
              />
            );
          })}
        </BottomTab.Navigator>
      </ActiveTabBarContextProvider>
    </NavigationContainer>
  );
};

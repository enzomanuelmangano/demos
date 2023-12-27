import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar, View } from 'react-native';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { BottomTabBar } from './components/bottom-tab-bar';
import type { ScreenNames } from './constants/screens';
import { ScreenNamesArray } from './constants/screens';
import { HomeScreen } from './screens/home';
import { SearchScreen } from './screens/search';
import { SwitchThemeProvider, useSwitchTheme } from './components/switch-theme';
import { DarkPalette, LightPalette } from './constants/palette';

const BottomTab = createBottomTabNavigator();

const BackgroundView = () => {
  return <View style={{ flex: 1 }} />;
};

const ScreenMap: Record<keyof typeof ScreenNames, () => React.ReactNode> = {
  Home: HomeScreen,
  Search: SearchScreen,
  Notifications: BackgroundView,
  Message: BackgroundView,
};

const TelegramThemeSwitch = () => {
  return (
    <BottomTab.Navigator
      initialRouteName="Search"
      // eslint-disable-next-line react/no-unstable-nested-components
      tabBar={props => {
        return <BottomTabBar {...props} />;
      }}>
      {ScreenNamesArray.map(key => {
        return (
          <BottomTab.Screen key={key} name={key} component={ScreenMap[key]} />
        );
      })}
    </BottomTab.Navigator>
  );
};

const App = () => {
  const LightTheme: typeof DefaultTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: LightPalette.background,
      text: LightPalette.text,
      border: LightPalette.text,
      card: LightPalette.card,
    },
  };

  const DarkTheme: typeof DefaultTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: DarkPalette.background,
      text: DarkPalette.text,
      border: DarkPalette.text,
      card: DarkPalette.card,
    },
  };

  const { theme } = useSwitchTheme();

  const selectedTheme = theme === 'light' ? LightTheme : DarkTheme;

  return (
    <NavigationContainer theme={selectedTheme} independent>
      <SafeAreaProvider>
        <TelegramThemeSwitch />
      </SafeAreaProvider>
    </NavigationContainer>
  );
};

const TelegramThemeSwitchContainer = () => {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" />
      <SwitchThemeProvider>
        <App />
      </SwitchThemeProvider>
    </GestureHandlerRootView>
  );
};

export { TelegramThemeSwitchContainer as TelegramThemeSwitch };

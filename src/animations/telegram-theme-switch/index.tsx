import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BottomTabBar } from './components/bottom-tab-bar';
import { ScreenNamesArray } from './constants/screens';
import { HomeScreen } from './screens/home';
import { SearchScreen } from './screens/search';
import { SwitchThemeProvider } from './components/switch-theme';

const BackgroundView = () => {
  return <View style={{ flex: 1 }} />;
};

const ScreenMap = {
  Home: HomeScreen,
  Search: SearchScreen,
  Notifications: BackgroundView,
  Message: BackgroundView,
};

const TelegramThemeSwitch = () => {
  const [activeTab, setActiveTab] = useState('Search');

  const handleTabPress = (routeName: string) => {
    setActiveTab(routeName);
  };

  const ActiveScreen = ScreenMap[activeTab as keyof typeof ScreenMap] || SearchScreen;

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          <ActiveScreen />
        </View>
        <BottomTabBar
          state={{
            key: 'tab',
            index: ScreenNamesArray.indexOf(activeTab as any),
            routeNames: [...ScreenNamesArray],
            routes: ScreenNamesArray.map(name => ({ key: name, name })),
            type: 'tab',
            stale: false,
            history: [],
            preloadedRouteKeys: [],
          } as any}
          descriptors={Object.fromEntries(
            ScreenNamesArray.map(name => [
              name,
              {
                navigation: {
                  navigate: handleTabPress,
                  emit: () => ({ defaultPrevented: false }),
                },
                route: { key: name, name },
                options: {},
                render: () => null,
              },
            ])
          ) as any}
          navigation={{
            navigate: handleTabPress,
            emit: () => ({ defaultPrevented: false }),
          } as any}
          insets={{ top: 0, right: 0, bottom: 0, left: 0 }}
        />
      </View>
    </SafeAreaProvider>
  );
};

const TelegramThemeSwitchContainer = () => {
  return (
    <SwitchThemeProvider>
      <TelegramThemeSwitch />
    </SwitchThemeProvider>
  );
};

export { TelegramThemeSwitchContainer as TelegramThemeSwitch };
import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BottomTabBar } from './components/bottom-tab-bar';
import { ScreenNamesArray } from './constants/screens';
import { HomeScreen } from './screens/home';
import { SearchScreen } from './screens/search';
import { SwitchThemeProvider } from './components/switch-theme';
import { ThemeProvider, useTheme } from './components/theme-provider';

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
  const { colors } = useTheme();

  const handleTabPress = (routeName: string) => {
    setActiveTab(routeName);
  };

  const ActiveScreen =
    ScreenMap[activeTab as keyof typeof ScreenMap] || SearchScreen;

  const activeTabIndex = ScreenNamesArray.indexOf(
    activeTab as (typeof ScreenNamesArray)[number],
  );

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flex: 1 }}>
          <ActiveScreen />
        </View>
        <BottomTabBar
          activeTabIndex={activeTabIndex}
          onTabPress={handleTabPress}
          colors={colors}
        />
      </View>
    </SafeAreaProvider>
  );
};

const TelegramThemeSwitchContainer = () => {
  return (
    <SwitchThemeProvider>
      <ThemeProvider>
        <TelegramThemeSwitch />
      </ThemeProvider>
    </SwitchThemeProvider>
  );
};

export { TelegramThemeSwitchContainer as TelegramThemeSwitch };

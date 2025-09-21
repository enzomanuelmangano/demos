import { useState } from 'react';
import { View } from 'react-native';

import { BottomTabBar } from './components/bottom-tab-bar';
import { ActiveTabBarContextProvider } from './components/bottom-tab-bar/active-tab-bar-provider';
import { ThemeProvider, useTheme } from './components/theme-provider';
import { ScreenNamesArray } from './constants/screens';
import { HomeScreen } from './screens/home';

const BackgroundView = () => {
  return <View style={{ flex: 1 }} />;
};

const ScreenMap = {
  Home: HomeScreen,
  Search: BackgroundView,
  Notifications: BackgroundView,
  Message: BackgroundView,
};

const TwitterTabBarContent = () => {
  const [activeTab, setActiveTab] = useState('Home');
  const { colors } = useTheme();

  const handleTabPress = (routeName: string) => {
    setActiveTab(routeName);
  };

  const ActiveScreen =
    ScreenMap[activeTab as keyof typeof ScreenMap] || HomeScreen;

  const activeTabIndex = ScreenNamesArray.indexOf(
    activeTab as (typeof ScreenNamesArray)[number],
  );

  return (
    <ActiveTabBarContextProvider>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flex: 1 }}>
          <ActiveScreen />
        </View>
        <BottomTabBar
          activeTabIndex={activeTabIndex}
          onTabPress={handleTabPress}
        />
      </View>
    </ActiveTabBarContextProvider>
  );
};

export const TwitterTabBar = () => {
  return (
    <ThemeProvider>
      <TwitterTabBarContent />
    </ThemeProvider>
  );
};

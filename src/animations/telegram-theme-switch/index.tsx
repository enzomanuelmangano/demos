import { StyleSheet, Text, View } from 'react-native';

import { useState } from 'react';

import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BottomTabBar } from './components/bottom-tab-bar';
import { SwitchThemeProvider } from './components/switch-theme';
import { ThemeProvider, useTheme } from './components/theme-provider';
import { ScreenNamesArray } from './constants/screens';
import { HomeScreen } from './screens/home';
import { SearchScreen } from './screens/search';

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
  const { colors, theme } = useTheme();

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
        {/* e2e outcome probe: exposes the active theme ("light"/"dark") as
            an assertable token after the circular reveal swap. */}
        <Text testID="telegram-theme-switch-status" style={styles.statusProbe}>
          {theme}
        </Text>
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

const styles = StyleSheet.create({
  statusProbe: {
    fontSize: 1,
    left: 0,
    opacity: 0.012,
    position: 'absolute',
    top: 0,
    zIndex: 999,
  },
});

export { TelegramThemeSwitchContainer as TelegramThemeSwitch };

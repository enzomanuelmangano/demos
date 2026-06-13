import { StyleSheet, Text, View } from 'react-native';

import { useState } from 'react';

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
        {/* e2e outcome probe: surfaces the active tab as an assertable value so
            a test can verify the tab switch actually changed the selection. */}
        <Text testID="twitter-tab-bar-status" style={styles.statusProbe}>
          {`tab:${activeTab.toLowerCase()}`}
        </Text>
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

const styles = StyleSheet.create({
  // Near-invisible to the eye, but on-screen + opaque enough for the
  // accessibility/view tree to expose it to e2e (alpha >= 0.01).
  statusProbe: {
    fontSize: 1,
    left: 0,
    opacity: 0.012,
    position: 'absolute',
    top: 0,
    zIndex: 1,
  },
});

export const TwitterTabBar = () => {
  return (
    <ThemeProvider>
      <TwitterTabBarContent />
    </ThemeProvider>
  );
};

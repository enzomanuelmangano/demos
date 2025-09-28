import { useCallback } from 'react';

import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ReanimatedScreenProvider } from 'react-native-screens/reanimated';

import { Home } from '../app/(stack)/(tabs)/(home-stack)/home';
import { Issues } from '../app/(stack)/(tabs)/(home-stack)/issues';
import { Inbox } from '../app/(stack)/(tabs)/inbox';
import { Search } from '../app/(stack)/(tabs)/search';
import { Settings } from '../app/(stack)/(tabs)/settings';
import { Note } from '../app/(stack)/note';
import { TabBar } from '../components/navigation/bottom-tab-bar';

import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator();

function HomeStackNavigator() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="home" component={Home} />
      <HomeStack.Screen name="issues" component={Issues} />
    </HomeStack.Navigator>
  );
}

function TabNavigator() {
  const tabBar = useCallback((props: BottomTabBarProps) => {
    const activeScreenName = props.state.routeNames[props.state.index];
    return <TabBar activeScreenName={activeScreenName} />;
  }, []);

  return (
    <Tab.Navigator tabBar={tabBar} screenOptions={{ headerShown: false }}>
      <Tab.Screen name="(home-stack)" component={HomeStackNavigator} />
      <Tab.Screen name="inbox" component={Inbox} />
      <Tab.Screen name="search" component={Search} />
      <Tab.Screen name="settings" component={Settings} />
    </Tab.Navigator>
  );
}

export function Navigation() {
  return (
    <ReanimatedScreenProvider>
      <Stack.Navigator
        initialRouteName="(tabs)"
        screenOptions={{ headerShown: false, presentation: 'modal' }}>
        <Stack.Screen name="(tabs)" component={TabNavigator} />
        <Stack.Screen name="note" component={Note} />
      </Stack.Navigator>
    </ReanimatedScreenProvider>
  );
}

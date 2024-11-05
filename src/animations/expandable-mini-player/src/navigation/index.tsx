import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useCallback } from 'react';

import { Screen } from '../components/navigation';
import { TabBar } from '../components/navigation/bottom-tab-bar';

const Tab = createBottomTabNavigator();

const DefaultScreen = () => <Screen title="Demo" />;

export function Navigation() {
  const tabBar = useCallback(
    (props: BottomTabBarProps) => <TabBar activeIndex={props.state.index} />,
    [],
  );

  return (
    <Tab.Navigator
      tabBar={tabBar}
      screenOptions={{
        headerShown: false,
      }}>
      <Tab.Screen name="home" component={DefaultScreen} />
      <Tab.Screen name="search" component={DefaultScreen} />
      <Tab.Screen name="edit" component={DefaultScreen} />
      <Tab.Screen name="settings" component={DefaultScreen} />
    </Tab.Navigator>
  );
}

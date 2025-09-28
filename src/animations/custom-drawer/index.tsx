import { useCallback } from 'react';

import { createDrawerNavigator } from '@react-navigation/drawer';

import { CustomDrawer } from './components/drawer';
import { DrawerIcon } from './components/drawer/drawer-icon';
import { HomeScreen, SettingsScreen } from './components/screens';

const Drawer = createDrawerNavigator();

const CustomDrawerContainer = () => {
  const headerLeft = useCallback(
    (props: { tintColor?: string | undefined }) => {
      return <DrawerIcon {...props} />;
    },
    [],
  );

  return (
    <Drawer.Navigator
      defaultStatus="closed"
      screenOptions={{
        overlayColor: 'transparent',
        drawerType: 'slide',
        headerTintColor: '#111',
        headerLeft,
      }}
      drawerContent={CustomDrawer}>
      <Drawer.Screen name="Home" component={HomeScreen} />
      <Drawer.Screen name="Settings" component={SettingsScreen} />
    </Drawer.Navigator>
  );
};

export { CustomDrawerContainer as CustomDrawer };

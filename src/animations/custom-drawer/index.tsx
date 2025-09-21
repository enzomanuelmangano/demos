import { createDrawerNavigator } from '@react-navigation/drawer';
import { useCallback } from 'react';

import { CustomDrawer } from './components/drawer';
import { DrawerIcon } from './components/drawer/drawer-icon';
import { HomeScreen, SettingsScreen } from './components/screens';

const Drawer = createDrawerNavigator();

const CustomDrawerContainer = () => {
  // Define the headerLeft component using the useCallback hook
  const headerLeft = useCallback(
    (props: { tintColor?: string | undefined }) => {
      return <DrawerIcon {...props} />;
    },
    [],
  );

  // Render the App component
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

// Export the App component
export { CustomDrawerContainer as CustomDrawer };

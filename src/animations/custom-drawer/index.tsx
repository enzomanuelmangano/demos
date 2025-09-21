import { View } from 'react-native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { useCallback } from 'react';

import { DrawerIcon } from './components/drawer/drawer-icon';
import { CustomDrawer } from './components/drawer';

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
      <Drawer.Screen name="Home" component={View} />
      <Drawer.Screen name="Settings" component={View} />
    </Drawer.Navigator>
  );
};

// Export the App component
export { CustomDrawerContainer as CustomDrawer };

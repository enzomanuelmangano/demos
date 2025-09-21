import { createDrawerNavigator } from '@react-navigation/drawer';
import { NavigationContainer } from '@react-navigation/native';
import { useCallback } from 'react';

import { DrawerIcon } from './components/drawer/drawer-icon';
import { CustomDrawer } from './components/drawer';
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
    <NavigationContainer>
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
    </NavigationContainer>
  );
};

// Export the App component
export { CustomDrawerContainer as CustomDrawer };

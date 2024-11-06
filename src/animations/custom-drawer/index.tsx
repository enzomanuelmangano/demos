import { View } from 'react-native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { NavigationContainer } from '@react-navigation/native';
import { useCallback } from 'react';

import { DrawerIcon } from './components/drawer/drawer-icon';
import { CustomDrawer } from './components/drawer';

// Create a drawer navigator
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
    <NavigationContainer independent>
      {/* Set the status bar style */}

      {/* Configure the drawer navigator */}
      <Drawer.Navigator
        defaultStatus="closed"
        screenOptions={{
          overlayColor: 'transparent',
          drawerType: 'slide',
          headerTintColor: '#111',
          headerLeft,
        }}
        // Here's the magic!
        drawerContent={CustomDrawer}>
        {/* Define the screens */}
        <Drawer.Screen name="Home" component={View} />
        <Drawer.Screen name="Settings" component={View} />
      </Drawer.Navigator>
    </NavigationContainer>
  );
};

// Export the App component
export { CustomDrawerContainer as CustomDrawer };

import { Dimensions } from 'react-native';

import { Drawer } from 'expo-router/drawer';

import { DrawerContent } from '../../src/navigation/components/drawer-content';

export default function DrawerLayout() {
  return (
    <Drawer
      drawerContent={DrawerContent}
      screenOptions={{
        headerShown: false,
        drawerStyle: {
          backgroundColor: '#000',
          width: 270,
        },
        drawerActiveTintColor: '#fff',
        drawerInactiveTintColor: '#666',
        drawerLabelStyle: {
          fontSize: 16,
          fontWeight: '500',
        },
        overlayColor: 'rgba(0, 0, 0, 0.5)',
        swipeEnabled: true,
        swipeEdgeWidth: Dimensions.get('window').width * 0.35,
      }}>
      <Drawer.Screen
        name="index"
        options={{
          drawerLabel: 'Home',
          title: 'Home',
        }}
      />
      <Drawer.Screen
        name="animations/[slug]"
        options={{
          drawerLabel: 'Animation',
          title: 'Animation',
        }}
      />
    </Drawer>
  );
}

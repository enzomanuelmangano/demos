import * as Haptics from 'expo-haptics';
import { Drawer } from 'expo-router/drawer';
import { PressablesConfig } from 'pressto';
import { Suspense } from 'react';
import { Dimensions, StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { KeyboardProvider } from 'react-native-keyboard-controller';
import { CustomDrawerContent } from '../src/components/custom-drawer-content';
import { FontsProvider } from '../src/components/fonts-provider';

const globalPressableHandlers = {
  onPress: () => {
    Haptics.selectionAsync();
  },
};

export default function RootLayout() {
  return (
    <Suspense>
      <StatusBar barStyle="default" animated />
      <KeyboardProvider>
        <PressablesConfig globalHandlers={globalPressableHandlers}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <FontsProvider>
              <Drawer
                drawerContent={CustomDrawerContent}
                screenOptions={{
                  headerShown: false,
                  drawerStyle: {
                    backgroundColor: '#000',
                    width: 300,
                  },
                  drawerActiveTintColor: '#fff',
                  drawerInactiveTintColor: '#666',
                  drawerLabelStyle: {
                    fontSize: 16,
                    fontWeight: '500',
                  },
                  overlayColor: 'rgba(0, 0, 0, 0.5)',
                  swipeEnabled: true,
                  swipeEdgeWidth: Dimensions.get('window').width * 0.3,
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
                    drawerItemStyle: { display: 'none' },
                    title: 'Animation',
                  }}
                />
              </Drawer>
            </FontsProvider>
          </GestureHandlerRootView>
        </PressablesConfig>
      </KeyboardProvider>
    </Suspense>
  );
}

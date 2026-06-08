// SDK 56: expo-router vendors its own react-navigation, so this demo's
// standalone navigator can no longer nest into the router's container —
// it runs as an independent tree instead.
import {
  DefaultTheme,
  NavigationContainer,
  NavigationIndependentTree,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AppDetailScreen, type RootStackParamList } from './app-detail-screen';
import { AppsList } from './apps-list';
import { withDetailScreenWrapper } from './navigation/DetailScreenWrapper';
import { ExpansionProvider } from './navigation/expansion-provider';
import { withMainScreenWrapper } from './navigation/MainScreenWrapper';

const Stack = createNativeStackNavigator<RootStackParamList>();

const iOSHomeGrid = () => {
  return (
    <ExpansionProvider>
      <NavigationIndependentTree>
        <NavigationContainer theme={DefaultTheme}>
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
              animation: 'fade',
            }}>
            <Stack.Screen
              name="Home"
              component={withMainScreenWrapper(AppsList)}
            />
            <Stack.Screen
              name="AppDetail"
              component={withDetailScreenWrapper(AppDetailScreen)}
              options={{
                animation: 'none',
              }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </NavigationIndependentTree>
    </ExpansionProvider>
  );
};

export { iOSHomeGrid };

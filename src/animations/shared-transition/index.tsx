import { memo } from 'react';

// SDK 56: expo-router vendors its own react-navigation, so this demo's
// standalone navigator can no longer nest into the router's container —
// it runs as an independent tree instead.
import {
  DefaultTheme,
  NavigationContainer,
  NavigationIndependentTree,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ScreenNames } from './constants/screen-names';
import { DetailsScreen } from './screens/details';
import { HomeScreen } from './screens/home';

import type { RootStackParamsList } from './typings';

const Stack = createNativeStackNavigator<RootStackParamsList>();

export const SharedTransitions = memo(() => {
  return (
    <>
      <NavigationIndependentTree>
        <NavigationContainer theme={DefaultTheme}>
          <Stack.Navigator
            initialRouteName={ScreenNames.Home}
            screenOptions={{
              animation: 'fade',
              animationDuration: 300,
            }}>
            <Stack.Screen name={ScreenNames.Home} component={HomeScreen} />
            <Stack.Screen
              name={ScreenNames.Details}
              component={DetailsScreen}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </NavigationIndependentTree>
    </>
  );
});

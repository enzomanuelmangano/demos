import { memo } from 'react';

import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ScreenNames } from './constants/screen-names';
import { DetailsScreen } from './screens/details';
import { HomeScreen } from './screens/home';

import type { RootStackParamsList } from './typings';

const Stack = createNativeStackNavigator<RootStackParamsList>();

export const SharedTransitions = memo(() => {
  return (
    <>
      <Stack.Navigator
        initialRouteName={ScreenNames.Home}
        screenOptions={{
          animation: 'fade',
          animationDuration: 300,
        }}>
        <Stack.Screen name={ScreenNames.Home} component={HomeScreen} />
        <Stack.Screen name={ScreenNames.Details} component={DetailsScreen} />
      </Stack.Navigator>
    </>
  );
});

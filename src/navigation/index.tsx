import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { useSetAtom } from 'jotai';

import { Home } from './home';
import { Screens } from './screens';
import { SearchFilterAtom } from './states/filters';

const MainStack = createNativeStackNavigator();

const MainNavigation = React.memo(() => {
  const updateFilterLabel = useSetAtom(SearchFilterAtom);

  return (
    <MainStack.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerShown: false,
      }}>
      <MainStack.Screen
        name="Home"
        component={Home}
        options={{
          headerShown: true,
          headerTransparent: true,
          headerLargeTitle: true,
          headerSearchBarOptions: {
            placeholder: 'Search',
            tintColor: 'white',
            textColor: 'white',
            hintTextColor: 'rgba(255,255,255,0.8)',
            onChangeText: event => {
              updateFilterLabel(event.nativeEvent.text);
            },
          },
          headerBlurEffect: 'systemThinMaterialDark',
          headerStyle: {
            backgroundColor: 'transparent',
          },
          title: 'Demos',
          headerTitleStyle: {
            color: 'white',
          },
        }}
      />
      {Screens.map(screen => {
        return (
          <MainStack.Screen
            key={screen.route}
            name={screen.route}
            component={screen.component}
          />
        );
      })}
    </MainStack.Navigator>
  );
});

export { MainNavigation };

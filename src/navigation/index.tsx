import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import { Home } from './home';
import { Screens } from './screens';

const MainStack = createNativeStackNavigator();

const MainNavigation = React.memo(() => {
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
            onChangeText: event => {
              console.log(event.nativeEvent.text);
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

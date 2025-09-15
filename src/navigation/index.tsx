import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSetAtom } from 'jotai';
import React, { useMemo } from 'react';
import type {
  NativeSyntheticEvent,
  TextInputChangeEventData,
} from 'react-native';

import { Home } from './home';
import { Screens } from './screens';
import { SearchFilterAtom } from './states/filters';

const MainStack = createNativeStackNavigator();

const MainNavigation = React.memo(() => {
  const updateFilterLabel = useSetAtom(SearchFilterAtom);

  const options = useMemo(() => {
    return {
      ...HomeHeaderOptions,
      headerSearchBarOptions: {
        ...HomeHeaderOptions.headerSearchBarOptions,
        onChangeText: (
          event: NativeSyntheticEvent<TextInputChangeEventData>,
        ) => {
          updateFilterLabel(event.nativeEvent.text);
        },
      },
    };
  }, [updateFilterLabel]);

  return (
    <MainStack.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerShown: false,
      }}>
      <MainStack.Screen name="Home" component={Home} options={options} />
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

const HomeHeaderOptions = {
  headerShown: true,
  headerTransparent: true,
  headerLargeTitle: true,
  headerSearchBarOptions: {
    placeholder: 'Search',
    tintColor: 'white',
    textColor: 'white',
    hintTextColor: 'rgba(255,255,255,0.8)',
    inputType: 'text',
    obscureBackground: false,
  },
  headerBlurEffect: 'systemThinMaterialDark',
  headerStyle: {
    backgroundColor: 'transparent',
  },
  title: 'Demos',
  headerTitleStyle: {
    color: 'white',
  },
} as const;

export { MainNavigation };

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useCallback, useMemo } from 'react';
import { useSetAtom } from 'jotai';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type {
  NativeSyntheticEvent,
  TextInputChangeEventData,
} from 'react-native';
import { PressableScale } from 'pressto';

import { Home } from './home';
import { Screens } from './screens';
import { SearchFilterAtom } from './states/filters';
import { Settings } from './settings';

const MainStack = createNativeStackNavigator();

const MainNavigation = React.memo(() => {
  const updateFilterLabel = useSetAtom(SearchFilterAtom);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { navigate } = useNavigation<any>();

  const navigateToSettings = useCallback(() => {
    navigate('Settings');
  }, [navigate]);

  const headerRight = useCallback(() => {
    return (
      <PressableScale
        onPress={navigateToSettings}
        style={{
          padding: 10,
        }}>
        <Ionicons name="settings-outline" size={24} color="white" />
      </PressableScale>
    );
  }, [navigateToSettings]);

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
      headerRight,
    };
  }, [headerRight, updateFilterLabel]);

  return (
    <MainStack.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerShown: false,
      }}>
      <MainStack.Screen name="Home" component={Home} options={options} />
      <MainStack.Screen
        name="Settings"
        component={Settings}
        options={{
          presentation: 'modal',
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

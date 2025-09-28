import { View, Image, StyleSheet, Dimensions } from 'react-native';

import { useCallback } from 'react';

import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { BottomTabBar } from './components/bottom-tab-bar';

import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

const BottomTab = createBottomTabNavigator();

const { width, height } = Dimensions.get('window');

const ImageScreen = ({ source }: { source: any }) => (
  <View style={styles.container}>
    <Image source={source} style={styles.image} resizeMode="cover" />
  </View>
);

const Screen1 = () => <ImageScreen source={require('./assets/01.jpg')} />;
const Screen2 = () => <ImageScreen source={require('./assets/02.jpg')} />;
const Screen3 = () => <ImageScreen source={require('./assets/03.jpg')} />;
const Screen4 = () => <ImageScreen source={require('./assets/01.jpg')} />;

const screens = [
  { name: 'Home', component: Screen1 },
  { name: 'Explore', component: Screen2 },
  { name: 'Camera', component: Screen3 },
  { name: 'Settings', component: Screen4 },
];

const App = () => {
  const tabBar = useCallback((props: BottomTabBarProps) => {
    return <BottomTabBar {...props} />;
  }, []);

  return (
    <BottomTab.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerShown: false,
      }}
      tabBar={tabBar}>
      {screens.map(({ name, component }) => (
        <BottomTab.Screen
          key={name}
          name={name}
          component={component}
          options={{
            freezeOnBlur: true,
          }}
        />
      ))}
    </BottomTab.Navigator>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    flex: 1,
  },
  image: {
    height,
    width,
  },
});

export { App as BlurredBottomBar };

import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ColorfulOnboarding } from './components/colorful-onboarding';

const App = () => {
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <ColorfulOnboarding
        data={[
          {
            title: 'Lazy Day Lounger',
            color: '#265D9E',
            image: require('../../../assets/animations/github-onboarding/02.jpg'),
          },
          {
            title: 'Whiskered Explorer',
            color: '#4E8DC5',
            image: require('../../../assets/animations/github-onboarding/01.jpg'),
          },
          {
            title: 'Curious Kitty Gaze',
            color: '#7BB2E9',
            image: require('../../../assets/animations/github-onboarding/03.jpg'),
          },
          {
            title: 'Sleek Feline in Repose',
            color: '#A1CAE8',
            image: require('../../../assets/animations/github-onboarding/04.jpg'),
          },
        ]}
      />
    </View>
  );
};

const AppContainer = () => {
  return (
    <GestureHandlerRootView style={styles.container}>
      <App />
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export { AppContainer as GitHubOnboarding };

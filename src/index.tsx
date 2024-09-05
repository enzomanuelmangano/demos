import { StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';

import { MainNavigation } from './navigation';
import { FontsProvider } from './components/fonts-provider';

const App = () => {
  return (
    <View style={styles.container}>
      <FontsProvider>
        <NavigationContainer>
          <MainNavigation />
        </NavigationContainer>
      </FontsProvider>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export { App };

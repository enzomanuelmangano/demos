import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';

import { CardInfo } from './components/card-info';

const StaggeredCardNumber = () => {
  const [fontsLoaded] = useFonts({
    FiraCode: require('./assets/fonts/firacode.ttf'),
  });

  if (!fontsLoaded) {
    return <></>;
  }

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <CardInfo cardNumber={2223000048400011} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#eaeaea',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export { StaggeredCardNumber };

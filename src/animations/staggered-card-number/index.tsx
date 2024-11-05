import { StyleSheet, View } from 'react-native';

import { CardInfo } from './components/card-info';

const StaggeredCardNumber = () => {
  return (
    <View style={styles.container}>
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

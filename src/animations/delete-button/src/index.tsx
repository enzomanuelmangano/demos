import { StyleSheet, View } from 'react-native';

import { DeleteButton } from './components/delete-button';

const App = () => {
  return (
    <View style={styles.container}>
      <DeleteButton
        onConfirmDeletion={() => {}}
        height={50}
        width={150}
        additionalWidth={80}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#fff',
    flex: 1,
    justifyContent: 'center',
  },
});

export { App };

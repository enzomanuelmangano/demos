import { StyleSheet, View } from 'react-native';

import { DeleteButton } from './components/delete-button';

const App = () => {
  return (
    <View style={styles.container}>
      <View testID="delete-button">
        <DeleteButton
          onConfirmDeletion={() => {}}
          height={50}
          width={150}
          additionalWidth={80}
        />
      </View>
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

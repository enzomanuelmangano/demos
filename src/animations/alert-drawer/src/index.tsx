import { StyleSheet, View } from 'react-native';

import { AlertDrawer } from './components/alert-drawer';

const App = () => {
  return (
    <View style={styles.container}>
      <AlertDrawer
        title="Are you sure?"
        description="You haven't backed up your wallet yet. If you remove it, you could lose access forever. We suggest tapping Cancel and backing up your wallet first with a valid recovery method."
        buttonLabel="Continue"
        onConfirm={() => console.log('Confirmed')}
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

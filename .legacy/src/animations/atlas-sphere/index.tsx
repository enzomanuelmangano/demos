import { StyleSheet, View } from 'react-native';

import { AtlasSphere as AtlasSphereComponent } from './atlas-sphere';

export const AtlasSphere = () => {
  return (
    <View style={styles.container}>
      <AtlasSphereComponent />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#000',
    flex: 1,
    justifyContent: 'center',
  },
});

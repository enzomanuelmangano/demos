import { StyleSheet, View } from 'react-native';

import { GeometryButton as GeometryButtonComponent } from './geometry-button';

export const GeometryButton = () => {
  return (
    <View style={styles.container}>
      <GeometryButtonComponent
        circles={50}
        size={100}
        onPress={() => {
          console.log('🪄');
        }}
      />
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

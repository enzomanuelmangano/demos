import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { GeometryButton as GeometryButtonComponent } from './geometry-button';

export const GeometryButton = () => {
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
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
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

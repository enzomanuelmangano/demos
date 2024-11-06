import { StyleSheet, View } from 'react-native';

import { FloatingModal } from './components/FloatingModal';

const FloatingModalContainer = () => {
  return (
    <View style={styles.container}>
      <FloatingModal />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
});

export { FloatingModalContainer as FloatingModal };

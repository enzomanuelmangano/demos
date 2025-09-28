import { StyleSheet } from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';

import { AppsList } from './apps-list';

const ShakeToDeleteAnimation = () => {
  return (
    <>
      <LinearGradient
        colors={['#000000', '#121212']}
        style={styles.background}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />
      <AppsList />
    </>
  );
};

const styles = StyleSheet.create({
  background: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});

export { ShakeToDeleteAnimation };

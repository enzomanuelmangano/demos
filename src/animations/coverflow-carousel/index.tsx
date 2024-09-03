import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { CoverFlowCarousel } from './components/coverflow-carousel';
import { Images } from './constants';

const CoverflowCarousel = () => {
  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.coverflow}>
        <CoverFlowCarousel images={Images} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverflow: {
    height: 250,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export { CoverflowCarousel };

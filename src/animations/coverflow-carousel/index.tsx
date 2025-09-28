import { StyleSheet, View } from 'react-native';

import { CoverFlowCarousel } from './components/coverflow-carousel';
import { Images } from './constants';

const CoverflowCarousel = () => {
  return (
    <View style={styles.container}>
      <View style={styles.coverflow}>
        <CoverFlowCarousel images={Images} />
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
  coverflow: {
    alignItems: 'center',
    height: 250,
    justifyContent: 'center',
  },
});

export { CoverflowCarousel };

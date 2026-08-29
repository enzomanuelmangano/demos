import { StyleSheet, Text, View } from 'react-native';

import { CardCarousel } from './components/card-carousel/card-carousel';

export const CardShaderReflections = () => {
  return (
    <View style={{ flex: 1 }}>
      {/* e2e probe: this demo self-animates with no interaction, so the test
          just asserts the surface mounted. Near-invisible (alpha ~0.01). */}
      <Text testID="card-shader-reflections-status" style={styles.statusProbe}>
        ready
      </Text>
      <CardCarousel />
    </View>
  );
};

const styles = StyleSheet.create({
  statusProbe: {
    color: '#000000',
    fontSize: 1,
    left: 0,
    opacity: 0.012,
    position: 'absolute',
    top: 0,
    zIndex: 999,
  },
});

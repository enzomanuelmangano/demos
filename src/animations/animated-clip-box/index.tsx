import { Dimensions, StyleSheet, View } from 'react-native';

import { ClipBoxButton } from './components/clip-box-button';

const boxWidth = Dimensions.get('window').width * 0.9;

export const AnimatedClipBox = () => {
  return (
    <View style={[styles.container, { flex: 1 }]}>
      <ClipBoxButton
        style={[styles.button, { marginBottom: 30 }]}
        actionTitle="Explore Demos"
        description="Perfect for learning how React Native Reanimated works, prototyping a new idea, or creating a demo to share online."
      />
      <ClipBoxButton
        style={styles.button}
        primaryColor="#ED7D3A"
        highlightColor="#E39264"
        actionTitle="Learn More"
        description="What if I tell you that this text is animated with React Native Reanimated?"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: 'white',
    elevation: 5,
    height: 250,
    shadowColor: 'black',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    width: boxWidth,
  },
  container: {
    alignItems: 'center',
    backgroundColor: '#fff',
    flex: 1,
    justifyContent: 'center',
  },
});

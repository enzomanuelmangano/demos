import { Dimensions, StyleSheet, Text, View } from 'react-native';

import { useCallback, useState } from 'react';

import { ClipBoxButton } from './components/clip-box-button';

const boxWidth = Dimensions.get('window').width * 0.9;

export const AnimatedClipBox = () => {
  // e2e outcome probe: tracks which of the two cards have triggered their
  // clip-reveal, exposed as an assertable token so a test can verify the press
  // actually fired the reveal. Visually negligible (alpha ~0.01).
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const reveal = useCallback((key: string) => {
    setRevealed(prev => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  return (
    <View style={[styles.container, { flex: 1 }]}>
      <Text testID="animated-clip-box-status" style={styles.statusProbe}>
        {`revealed:${revealed.size}`}
      </Text>
      <ClipBoxButton
        testID="animated-clip-box-explore"
        style={[styles.button, { marginBottom: 30 }]}
        actionTitle="Explore Demos"
        description="Perfect for learning how React Native Reanimated works, prototyping a new idea, or creating a demo to share online."
        onReveal={() => reveal('explore')}
      />
      <ClipBoxButton
        testID="animated-clip-box-learn-more"
        style={styles.button}
        primaryColor="#ED7D3A"
        highlightColor="#E39264"
        actionTitle="Learn More"
        description="What if I tell you that this text is animated with React Native Reanimated?"
        onReveal={() => reveal('learn-more')}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: 'white',
    boxShadow: '0px 0px 20px rgba(0, 0, 0, 0.15)',
    height: 250,
    width: boxWidth,
  },
  container: {
    alignItems: 'center',
    backgroundColor: '#fff',
    flex: 1,
    justifyContent: 'center',
  },
  statusProbe: {
    color: '#fff',
    fontSize: 1,
    left: 0,
    opacity: 0.012,
    position: 'absolute',
    top: 0,
    zIndex: 1000,
  },
});

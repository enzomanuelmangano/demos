import { Modal, Pressable, StyleSheet, Text } from 'react-native';

import { useEffect, useState } from 'react';

import { useAnimatedReaction } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { BouncyProgressShared, startAnimation } from './animations/bouncy';
import { AppsList } from './screens/home';
import { SpringCustomizer } from './screens/spring-customizer';

/**
 * Main application component that manages the home screen and spring customizer modal
 */
export const IosHomeBouncy = () => {
  const [showCustomizer, setShowCustomizer] = useState(false);

  // Trigger initial animation on mount
  useEffect(() => {
    startAnimation();
  }, []);

  const handleLongPress = () => {
    setShowCustomizer(true);
  };

  const handleCloseCustomizer = () => {
    setShowCustomizer(false);
  };

  // e2e outcome probe: flips to 'ready' once the bouncy entrance settles open.
  const [ready, setReady] = useState(false);
  useAnimatedReaction(
    () => BouncyProgressShared.get() >= 2,
    (settled, prev) => {
      if (settled && !prev) {
        scheduleOnRN(setReady, true);
      }
    },
  );

  return (
    <SafeAreaProvider>
      <Pressable
        testID="ios-home-bouncy-screen"
        style={{ flex: 1 }}
        onPress={startAnimation}
        onLongPress={handleLongPress}>
        {/* e2e outcome probe: near-invisible (alpha ~0.01). */}
        <Text testID="ios-home-bouncy-status" style={styles.statusProbe}>
          {ready ? 'ready' : 'animating'}
        </Text>
        <AppsList />
      </Pressable>
      <Modal
        visible={showCustomizer}
        transparent
        animationType="fade"
        onRequestClose={handleCloseCustomizer}>
        <SpringCustomizer onClose={handleCloseCustomizer} />
      </Modal>
    </SafeAreaProvider>
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

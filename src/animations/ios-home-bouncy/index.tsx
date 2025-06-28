import { useEffect, useState } from 'react';
import { Modal, Pressable } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { startAnimation } from './animations/bouncy';
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

  return (
    <SafeAreaProvider>
      <Pressable
        style={{ flex: 1 }}
        onPress={startAnimation}
        onLongPress={handleLongPress}>
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

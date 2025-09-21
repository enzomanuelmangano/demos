import { useCallback } from 'react';
import {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

// Custom hook to handle the visibility and animation of a QR code
export const useActiveQRCode = () => {
  // Define a shared value to toggle the visibility of the QR code
  const showQRCode = useSharedValue(false);

  // Define animated style for scaling and rotating the QR code
  const rStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: withSpring(showQRCode.value ? 1.4 : 1) }, // Scale animation when showing or hiding QR code
      {
        rotate: withSpring(showQRCode.value ? '0deg' : '-10deg'),
      }, // Rotate animation when showing or hiding QR code
    ],
  }));

  // Define animated style for fading the logo container in and out
  const rLogoContainerStyle = useAnimatedStyle(() => ({
    opacity: withTiming(showQRCode.value ? 0 : 1), // Opacity animation when showing or hiding QR code
  }));

  // Function to toggle the visibility of the QR code
  const toggleQRCodeVisibility = useCallback(() => {
    showQRCode.value = !showQRCode.value; // Toggle the value of showQRCode to show or hide the QR code
  }, [showQRCode]);

  // Return animated styles and function to toggle QR code visibility for consumption by the component
  return { rStyle, rLogoContainerStyle, toggleQRCodeVisibility };
};

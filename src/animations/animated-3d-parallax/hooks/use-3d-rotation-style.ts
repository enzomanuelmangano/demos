import type { SharedValue } from 'react-native-reanimated';
import { interpolate, useAnimatedStyle } from 'react-native-reanimated';

// Defining the type for the parameters of the use3DRotationStyle function
type Use3DRotationStyleParams = {
  x: SharedValue<number>;
  y: SharedValue<number>;
  maxSize: number;
  maxRotation: number;
};

// If you want to fully understand the math behind this function,
// I've made in the past a video about it: https://youtu.be/pVesCl7TY8A
// Function that calculates the 3D rotation style based on the provided parameters
const use3DRotationStyle = ({
  x,
  y,
  maxSize,
  maxRotation,
}: Use3DRotationStyleParams) => {
  // Define the animated style using useAnimatedStyle hook
  const rStyle = useAnimatedStyle(() => {
    // Calculate the rotation on the X-axis
    const rotateX = interpolate(
      y.value, // NOTE: We use y.value instead of x.value
      [0, maxSize],
      [maxRotation, -maxRotation],
    );

    // Calculate the rotation on the Y-axis
    const rotateY = interpolate(
      x.value, // NOTE: We use x.value instead of y.value
      [0, maxSize],
      [-maxRotation, maxRotation],
    );

    // Return the animated style with perspective and rotation transformations
    return {
      transform: [
        { perspective: 500 },
        { rotateX: `${rotateX}deg` },
        { rotateY: `${rotateY}deg` },
      ],
    };
  }, []);

  // Return the rotation style
  return {
    rRotationStyle: rStyle,
  };
};

// Export the use3DRotationStyle function
export { use3DRotationStyle };

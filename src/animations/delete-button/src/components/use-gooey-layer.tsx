import { useMemo } from 'react';

import { Blur, ColorMatrix, Paint } from '@shopify/react-native-skia';

// Define an interface for the hook parameters
interface GooeyLayerParams {
  blurRadius?: number;
  alphaMultiplier?: number;
  alphaOffset?: number;
}

// Custom hook to create a gooey effect layer
export const useGooeyLayer = ({
  blurRadius = 10,
  alphaMultiplier = 18,
  alphaOffset = -10,
}: GooeyLayerParams = {}) => {
  // Use useMemo to memoize the layer, preventing unnecessary re-renders
  const layer = useMemo(() => {
    return (
      <Paint>
        {/* Apply a blur effect with a radius of 10 */}
        <Blur blur={blurRadius} />
        {/* Apply a color matrix transformation */}
        <ColorMatrix
          // prettier-ignore
          matrix={[
            // Color matrix values:
            // Each row represents R, G, B, A channels and a bias value
            // The matrix is applied to each pixel: [R', G', B', A'] = [R, G, B, A, 1] * matrix
            1, 0, 0, 0, 0, // Red channel: no change
            0, 1, 0, 0, 0, // Green channel: no change
            0, 0, 1, 0, 0, // Blue channel: no change
            0, 0, 0, alphaMultiplier, alphaOffset, // Alpha channel: creates gooey effect
          ]}
        />
      </Paint>
    );
  }, [alphaMultiplier, alphaOffset, blurRadius]);

  return layer;
};

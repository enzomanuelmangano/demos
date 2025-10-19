/**
 * Back side of the ticket component displaying a QR code.
 * Features a centered QR code with rounded corners and a gradient fill.
 */

import { View } from 'react-native';

import { LinearGradient } from '@shopify/react-native-skia';
import QRCode from 'react-native-qrcode-skia';

const QR_SIZE = 150;

export const BackSide = () => {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
      }}>
      {/* QR Code with gradient fill and rounded corners */}
      <QRCode
        value="https://reactiive.io/demos"
        size={QR_SIZE}
        shapeOptions={{
          shape: 'rounded', // Rounded corners for QR code modules
          eyePatternShape: 'rounded', // Rounded corners for finder patterns
          eyePatternGap: 0, // No gap between finder pattern elements
          gap: 0, // No gap between QR code modules
        }}>
        {/* Premium gradient fill for QR code - static gradient */}
        <LinearGradient
          start={{ x: 0, y: 0 }}
          end={{ x: QR_SIZE, y: QR_SIZE }}
          colors={['#D4AF37', '#8B6914', '#4A3C1F']}
        />
      </QRCode>
    </View>
  );
};

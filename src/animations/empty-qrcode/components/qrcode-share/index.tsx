import React, { useImperativeHandle } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { useDerivedValue } from 'react-native-reanimated';
import QRCode from 'react-native-qrcode-skia';
import {
  vec,
  RadialGradient,
  Path1DPathEffect,
  Canvas,
  Rect,
  Text,
  useFont,
} from '@shopify/react-native-skia';

import { useActiveLetterAnimation } from './hooks/use-active-letter';
import { useActiveQRCode } from './hooks/use-active-qrcode';

// Import the custom font
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SFProRoundedBold = require('../../assets/fonts/SF-Pro-Rounded-Bold.otf');

const DEFAULT_FONT_SIZE = 110;
const DEFAULT_QRCODE_SIZE = 150;
const DEFAULT_QRCODE_PADDING = 30;
const pathLineWidth = 1;

// Define the type for the props passed to the QRCodeShare component
type QRCodeShareProps = {
  fontSize?: number; // Font size for the active letter
  qrCodeSize?: number; // Size of the QR code
  qrCodeValue: string; // Value to encode in the QR code
  qrCodePadding?: number; // Padding around the QR code
};

// Define the type for the reference of the QRCodeShare component
export type QRCodeShareRefType = {
  toggle: () => void; // Function to toggle QR code visibility
};

// Forward the ref and define the QRCodeShare component
const QRCodeShare = React.forwardRef<QRCodeShareRefType, QRCodeShareProps>(
  (
    {
      fontSize = DEFAULT_FONT_SIZE,
      qrCodeSize = DEFAULT_QRCODE_SIZE,
      qrCodePadding = DEFAULT_QRCODE_PADDING,
      qrCodeValue,
    },
    ref,
  ) => {
    // Get animation values and functions from custom hooks
    const { rStyle, rLogoContainerStyle, toggleQRCodeVisibility } =
      useActiveQRCode();
    const { activeLetter, activeColors } = useActiveLetterAnimation({
      timeInterval: 650,
    });
    // Get the font
    const font = useFont(SFProRoundedBold, fontSize);

    // Calculate the x-coordinate for the active letter
    const letterX = useDerivedValue(() => {
      if (!font) return -100;
      return -font.getTextWidth(activeLetter.value) / 2 + qrCodeSize / 2;
    }, [font, qrCodeSize]);

    // Expose the toggle function via the ref
    useImperativeHandle(
      ref,
      () => ({
        toggle: toggleQRCodeVisibility,
      }),
      [toggleQRCodeVisibility],
    );

    // Render the component
    return (
      <Animated.View
        style={[
          styles.container,
          {
            width: qrCodeSize,
            height: qrCodeSize,
          },
          rStyle,
        ]}>
        <Animated.View
          style={[StyleSheet.absoluteFill, { zIndex: 1 }, rLogoContainerStyle]}>
          <Canvas style={{ flex: 1 }}>
            {/* Draw a radial gradient background */}
            <Rect x={0} y={0} width={qrCodeSize} height={qrCodeSize}>
              <RadialGradient
                c={vec(qrCodeSize / 2, qrCodeSize / 2)}
                colors={activeColors}
                r={qrCodeSize / 2}
              />
            </Rect>
            {/* Render the active letter */}
            {font && (
              <Text
                text={activeLetter}
                color={'white'}
                font={font}
                x={letterX}
                y={fontSize / 3 + qrCodeSize / 2}
              />
            )}
          </Canvas>
        </Animated.View>
        {/* Render the QR code */}
        <View style={{ flex: 1, backgroundColor: '#111' }}>
          {/*
           * At the beginning the whole custom QRCode was defined in this demo
           * But I realized that it would be better to create a package out of it
           * react-native-qrcode-skia: https://github.com/enzomanuelmangano/react-native-qrcode-skia
           */}
          <QRCode
            value={qrCodeValue}
            errorCorrectionLevel="H"
            padding={qrCodePadding}
            pathColor="white"
            size={qrCodeSize}>
            {/* Apply a path effect for a custom path */}
            <Path1DPathEffect
              path={`M ${pathLineWidth} 0 A ${pathLineWidth} ${pathLineWidth} 0 0 0 0 -${pathLineWidth} A ${pathLineWidth} ${pathLineWidth} 0 0 0 -${pathLineWidth} 0 A ${pathLineWidth} ${pathLineWidth} 0 0 0 0 ${pathLineWidth} A ${pathLineWidth} ${pathLineWidth} 0 0 0 ${pathLineWidth} 0`}
              advance={2.8}
              phase={1}
              style="rotate"
            />
          </QRCode>
        </View>
      </Animated.View>
    );
  },
);

// Define styles for the component
const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    alignSelf: 'center',
    borderRadius: 50,
    borderCurve: 'continuous',
  },
});

// Export the QRCodeShare component
export { QRCodeShare };

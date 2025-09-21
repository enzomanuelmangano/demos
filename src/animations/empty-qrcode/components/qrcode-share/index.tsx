import {
  Canvas,
  RadialGradient,
  Rect,
  Text,
  useFont,
  vec,
} from '@shopify/react-native-skia';
import React, { useImperativeHandle } from 'react';
import { StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-skia';
import Animated, { useDerivedValue } from 'react-native-reanimated';

import { useActiveLetterAnimation } from './hooks/use-active-letter';
import { useActiveQRCode } from './hooks/use-active-qrcode';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const SFProRoundedBold = require('../../../../../assets/fonts/SF-Pro-Rounded-Bold.otf');

const DEFAULT_FONT_SIZE = 110;
const DEFAULT_QRCODE_SIZE = 150;
const DEFAULT_QRCODE_PADDING = 30;

type QRCodeShareProps = {
  fontSize?: number; // Font size for the active letter
  qrCodeSize?: number; // Size of the QR code
  qrCodeValue: string; // Value to encode in the QR code
  qrCodePadding?: number; // Padding around the QR code
};

export type QRCodeShareRefType = {
  toggle: () => void; // Function to toggle QR code visibility
};

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
    const { rStyle, rLogoContainerStyle, toggleQRCodeVisibility } =
      useActiveQRCode();
    const { activeLetter, activeColors } = useActiveLetterAnimation({
      timeInterval: 650,
    });
    const font = useFont(SFProRoundedBold, fontSize);

    const letterX = useDerivedValue(() => {
      if (!font) return -100;
      return -font.getTextWidth(activeLetter.value) / 2 + qrCodeSize / 2;
    }, [font, qrCodeSize]);

    useImperativeHandle(
      ref,
      () => ({
        toggle: toggleQRCodeVisibility,
      }),
      [toggleQRCodeVisibility],
    );

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
            <Rect x={0} y={0} width={qrCodeSize} height={qrCodeSize}>
              <RadialGradient
                c={vec(qrCodeSize / 2, qrCodeSize / 2)}
                colors={activeColors}
                r={qrCodeSize / 2}
              />
            </Rect>
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
        <View
          style={{
            flex: 1,
            backgroundColor: '#111',
            justifyContent: 'center',
            alignItems: 'center',
          }}>
          <QRCode
            value={qrCodeValue}
            errorCorrectionLevel="H"
            pathStyle="fill"
            color="white"
            size={qrCodeSize - qrCodePadding * 2}
          />
        </View>
      </Animated.View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    alignSelf: 'center',
    borderRadius: 50,
    borderCurve: 'continuous',
  },
});

export { QRCodeShare };

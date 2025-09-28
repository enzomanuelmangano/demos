import { StyleSheet, View } from 'react-native';

import { forwardRef, useImperativeHandle } from 'react';

import {
  Canvas,
  RadialGradient,
  Rect,
  Text,
  useFont,
  vec,
} from '@shopify/react-native-skia';
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
  fontSize?: number;
  qrCodeSize?: number;
  qrCodeValue: string;
  qrCodePadding?: number;
};

export type QRCodeShareRefType = {
  toggle: () => void;
};

const QRCodeShare = forwardRef<QRCodeShareRefType, QRCodeShareProps>(
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
      return -font.measureText(activeLetter.value).width / 2 + qrCodeSize / 2;
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
    alignSelf: 'center',
    borderCurve: 'continuous',
    borderRadius: 50,
    overflow: 'hidden',
  },
});

export { QRCodeShare };

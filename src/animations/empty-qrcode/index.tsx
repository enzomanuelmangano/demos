import { StyleSheet, Text, View } from 'react-native';

import { memo, useRef, useState } from 'react';

import { PressableScale } from 'pressto';

import { QRCodeShare } from './components/qrcode-share';

import type { QRCodeShareRefType } from './components/qrcode-share';

export const EmptyQRCode = memo(() => {
  const qrCodeShareRef = useRef<QRCodeShareRefType>(null);

  // e2e outcome probe: the assemble/disassemble is a staggered Skia animation
  // toggled via an imperative ref, with no inspectable RN state. We latch
  // "assembled" the first time the QR is toggled on (it starts empty), so the
  // assertion proves the toggle actually fired. Near-invisible (alpha ~0.01).
  const [everAssembled, setEverAssembled] = useState(false);

  return (
    <View style={styles.container}>
      <Text testID="empty-qr-code-status" style={styles.statusProbe}>
        {everAssembled ? 'assembled' : 'empty'}
      </Text>
      <PressableScale
        testID="empty-qr-code-toggle"
        onPress={() => {
          setEverAssembled(true);
          qrCodeShareRef.current?.toggle();
        }}>
        <QRCodeShare
          ref={qrCodeShareRef}
          qrCodeValue="https://reactiive.io/demos"
        />
      </PressableScale>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fbfbfb',
    flex: 1,
    justifyContent: 'center',
  },
  statusProbe: {
    color: '#000',
    fontSize: 1,
    left: 0,
    opacity: 0.012,
    position: 'absolute',
    top: 0,
  },
});

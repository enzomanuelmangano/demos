import { StyleSheet, View } from 'react-native';

import { memo, useRef } from 'react';

import { PressableScale } from 'pressto';

import { QRCodeShare } from './components/qrcode-share';

import type { QRCodeShareRefType } from './components/qrcode-share';

export const EmptyQRCode = memo(() => {
  const qrCodeShareRef = useRef<QRCodeShareRefType>(null);
  return (
    <View style={styles.container}>
      <PressableScale
        onPress={() => {
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
});

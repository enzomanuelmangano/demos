import { PressableScale } from 'pressto';
import React, { useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import type { QRCodeShareRefType } from './components/qrcode-share';
import { QRCodeShare } from './components/qrcode-share';

export const EmptyQRCode = React.memo(() => {
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
    flex: 1,
    backgroundColor: '#fbfbfb',
    justifyContent: 'center',
  },
});

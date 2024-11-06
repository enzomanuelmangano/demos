import { StyleSheet, View } from 'react-native';
import React, { useRef } from 'react';
import { PressableScale } from 'pressto';

import type { QRCodeShareRefType } from './components/qrcode-share';
import { QRCodeShare } from './components/qrcode-share';

// App component
export const EmptyQRCode = React.memo(() => {
  const qrCodeShareRef = useRef<QRCodeShareRefType>(null);
  return (
    <View style={styles.container}>
      {/* QR code component */}
      <PressableScale
        onPress={() => {
          qrCodeShareRef.current?.toggle();
        }}>
        <QRCodeShare
          ref={qrCodeShareRef}
          qrCodeValue="https://www.reactiive.io/patreon"
        />
      </PressableScale>
    </View>
  );
});

// Styles for the components
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fbfbfb',
    justifyContent: 'center',
  },
});

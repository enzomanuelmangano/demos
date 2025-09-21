import {
  DiscretePathEffect,
  SweepGradient,
  vec,
} from '@shopify/react-native-skia';
import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import QRCode from 'react-native-qrcode-skia';
import { useSharedValue } from 'react-native-reanimated';

import { Slider } from './components/slider';

const QRCodeGenerator = () => {
  const { width: windowWidth } = useWindowDimensions();

  const strokeWidthProgress = 0.5;
  const deviationProgress = useSharedValue(6);

  const [qrText, setQRCode] = useState('reactiive.io');

  return (
    <View style={[styles.container, { flex: 1 }]}>
      <TextInput
        style={styles.textInput}
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect={false}
        placeholderTextColor={'gray'}
        cursorColor={'white'}
        placeholder="Enter text to generate QR code"
        onChangeText={text => {
          setQRCode(text);
        }}
      />

      <QRCode
        value={qrText ? qrText : 'reactiive.io'}
        size={windowWidth * 0.9}
        style={{
          alignSelf: 'center',
          aspectRatio: 1,
        }}
        strokeWidth={strokeWidthProgress}
        errorCorrectionLevel="H">
        <SweepGradient
          c={vec(windowWidth / 2, windowWidth / 2)}
          colors={['cyan', 'magenta', 'cyan']}
        />

        <DiscretePathEffect length={10} deviation={0} />
      </QRCode>

      <View style={styles.sliderContainer}>
        <View style={{ marginTop: 20 }}>
          <Text style={styles.title}>Deviation</Text>
          <Slider
            initialProgress={0.5}
            maxValue={6}
            style={{
              marginTop: 30,
              width: windowWidth - 50,
            }}
            onUpdate={prog => {
              deviationProgress.value = prog;
            }}
          />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'center',
  },
  textInput: {
    borderWidth: 1,
    marginHorizontal: '5%',
    borderColor: 'white',
    color: 'white',
    fontSize: 20,
    paddingVertical: 15,
    paddingHorizontal: 15,
    marginBottom: 25,
    borderRadius: 10,
  },
  title: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  sliderContainer: { marginLeft: 25, marginTop: 30 },
});

export { QRCodeGenerator };

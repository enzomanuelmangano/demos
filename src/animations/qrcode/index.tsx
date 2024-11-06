import {
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import React, { useState } from 'react';
import {
  vec,
  SweepGradient,
  DiscretePathEffect,
} from '@shopify/react-native-skia';
import { useSharedValue } from 'react-native-reanimated';
import QRCode from 'react-native-qrcode-skia';

import { Slider } from './components/slider';

// App component
const QRCodeGenerator = () => {
  const { width: windowWidth } = useWindowDimensions();

  // Initialize progress values for stroke width and deviation
  const strokeWidthProgress = 0.5;
  const deviationProgress = useSharedValue(6);

  // Initialize state for the QR code text
  const [qrText, setQRCode] = useState('reactiive.io');

  return (
    <View style={[styles.container, { flex: 1 }]}>
      {/* Input field for QR code text */}
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

      {/* QR code component */}
      {/* I've moved the logic in a separate package! */}
      <QRCode
        value={qrText ? qrText : 'reactiive.io'}
        size={windowWidth * 0.9}
        style={{
          alignSelf: 'center',
          aspectRatio: 1,
        }}
        strokeWidth={strokeWidthProgress}
        errorCorrectionLevel="H">
        {/* Gradient effect for QR code */}
        <SweepGradient
          c={vec(windowWidth / 2, windowWidth / 2)}
          colors={['cyan', 'magenta', 'cyan']}
        />

        {/* Path effect for QR code */}
        <DiscretePathEffect length={10} deviation={deviationProgress} />
      </QRCode>

      {/* Slider components for adjusting stroke width and deviation */}
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

// Styles for the components
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

// Export the App component
export { QRCodeGenerator };

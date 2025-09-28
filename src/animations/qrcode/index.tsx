import {
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import { useState } from 'react';

import {
  DiscretePathEffect,
  SweepGradient,
  vec,
} from '@shopify/react-native-skia';
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
    backgroundColor: 'black',
    flex: 1,
    justifyContent: 'center',
  },
  sliderContainer: { marginLeft: 25, marginTop: 30 },
  textInput: {
    borderColor: 'white',
    borderRadius: 10,
    borderWidth: 1,
    color: 'white',
    fontSize: 20,
    marginBottom: 25,
    marginHorizontal: '5%',
    paddingHorizontal: 15,
    paddingVertical: 15,
  },
  title: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
});

export { QRCodeGenerator };

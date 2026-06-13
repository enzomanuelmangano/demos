import {
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
  useWindowDimensions,
} from 'react-native';

import { useState } from 'react';

import {
  DiscretePathEffect,
  LinearGradient,
  vec,
} from '@shopify/react-native-skia';
import QRCode from 'react-native-qrcode-skia';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Slider } from './components/slider';

const QRCodeGenerator = () => {
  const { width: windowWidth } = useWindowDimensions();

  const strokeWidthProgress = 0.5;
  const deviationProgress = useSharedValue(6);
  const { top: safeAreaTop } = useSafeAreaInsets();

  const [qrText, setQRCode] = useState('reactiive.io');

  return (
    <ScrollView
      style={[styles.container, { flex: 1 }]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={{
        justifyContent: 'center',
        paddingTop: safeAreaTop + 50,
      }}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View>
          {/* e2e outcome probe: mirrors the live QR content so a test can
              verify typing actually regenerated the code. Visually negligible. */}
          <Text testID="qr-code-generator-status" style={styles.statusProbe}>
            {`qr:${qrText}`}
          </Text>
          <TextInput
            testID="qr-code-generator-input"
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
            <LinearGradient
              start={vec(0, 0)}
              end={vec(windowWidth, windowWidth)}
              colors={['#FF0000', '#FF4D00', '#FF9900', '#FFCC00']}
            />
            <DiscretePathEffect length={10} deviation={deviationProgress} />
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
                  deviationProgress.set(prog);
                }}
              />
            </View>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'black',
    flex: 1,
  },
  sliderContainer: { marginLeft: 25, marginTop: 30 },
  // Near-invisible to the eye, but on-screen + opaque enough for the
  // accessibility/view tree to expose it to e2e (alpha >= 0.01).
  statusProbe: {
    color: 'white',
    fontSize: 1,
    left: 0,
    opacity: 0.012,
    position: 'absolute',
    top: 0,
  },
  textInput: {
    borderColor: 'white',
    borderCurve: 'continuous',
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

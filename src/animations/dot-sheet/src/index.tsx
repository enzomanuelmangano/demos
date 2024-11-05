import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRef } from 'react';
import { PressableScale } from 'pressto';

import { BackgroundGradient } from './components/background-gradient';
import type { CardInputRefType } from './components/card-input';
import { CardInput } from './components/card-input';

const App = () => {
  const { bottom: safeBottom } = useSafeAreaInsets();

  const cardInputRef = useRef<CardInputRefType>(null);

  return (
    <>
      <BackgroundGradient style={styles.background} />
      <View style={styles.fillCenter}>
        <Text style={styles.title}>One more thing</Text>
        <Text style={styles.subtitle}>
          This animation is inspired by Dot and made with React Native.
        </Text>
      </View>
      <View style={styles.fill} />
      <CardInput ref={cardInputRef} />
      <PressableScale
        onPress={() => {
          cardInputRef.current?.focus();
        }}
        style={[
          {
            bottom: safeBottom + 16,
          },
          styles.bottomButton,
        ]}>
        <Text style={styles.buttonTitle}>Start your Journey</Text>
      </PressableScale>
    </>
  );
};

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  fillCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontFamily: 'AddingtonCF-Light',
    fontSize: 28,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: 'AddingtonCF-Light',
    fontSize: 18,
    letterSpacing: -0.5,
    color: '#6c6c6c',
    textAlign: 'center',
    marginTop: 12,
    maxWidth: '60%',
  },
  background: {
    position: 'absolute',
    height: '100%',
  },
  bottomButton: {
    position: 'absolute',
    width: '85%',
    height: 52,
    borderRadius: 30,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(55, 55, 55, 0.2)',
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonTitle: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '700',
  },
});

export { App };

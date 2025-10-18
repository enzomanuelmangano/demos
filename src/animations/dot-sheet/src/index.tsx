import { StyleSheet, Text, View } from 'react-native';

import { useRef } from 'react';

import { PressableScale } from 'pressto';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackgroundGradient } from './components/background-gradient';
import { CardInput } from './components/card-input';

import type { CardInputRefType } from './components/card-input';

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
  background: {
    height: '100%',
    position: 'absolute',
  },
  bottomButton: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(55, 55, 55, 0.2)',
    borderRadius: 30,
    height: 52,
    justifyContent: 'center',
    position: 'absolute',
    width: '85%',
  },
  buttonTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  fill: {
    flex: 1,
  },
  fillCenter: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  subtitle: {
    color: '#6c6c6c',
    fontFamily: 'AddingtonCF-Light',
    fontSize: 18,
    letterSpacing: -0.5,
    marginTop: 12,
    maxWidth: '60%',
    textAlign: 'center',
  },
  title: {
    fontFamily: 'AddingtonCF-Light',
    fontSize: 28,
    letterSpacing: -0.5,
  },
});

export { App };

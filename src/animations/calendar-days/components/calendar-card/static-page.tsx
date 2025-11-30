import { StyleSheet, Text, View } from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';

import { BODY_COLOR, NUMBER_HEIGHT, PAGE_SIZE, SIZE } from './constants';

import type { StaticPageProps } from './types';

const FoldShadowTop = () => (
  <>
    <LinearGradient
      colors={['transparent', 'rgba(0,0,0,0.03)']}
      style={styles.topGradient}
    />
    <View style={styles.dividerLine} />
  </>
);

const FoldShadowBottom = () => (
  <LinearGradient
    colors={['rgba(0,0,0,0.04)', 'transparent']}
    style={styles.bottomGradient}
  />
);

export const StaticPage = ({ pageNumber, position }: StaticPageProps) => {
  const isTop = position === 'top';

  return (
    <View
      style={[
        styles.container,
        isTop ? styles.topPosition : styles.bottomPosition,
      ]}>
      {isTop ? <FoldShadowTop /> : <FoldShadowBottom />}
      <View
        style={[
          styles.numberContainer,
          {
            transform: [{ translateY: isTop ? PAGE_SIZE / 2 : -PAGE_SIZE / 2 }],
          },
        ]}>
        <Text style={styles.numberText}>{pageNumber}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  bottomGradient: {
    height: 15,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 9,
  },
  bottomPosition: {
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    borderCurve: 'continuous',
    top: PAGE_SIZE,
  },
  container: {
    alignItems: 'center',
    backgroundColor: BODY_COLOR,
    borderCurve: 'continuous',
    height: PAGE_SIZE,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'absolute',
    width: SIZE,
  },
  dividerLine: {
    backgroundColor: 'rgba(0,0,0,0.08)',
    bottom: 0,
    height: 1,
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 10,
  },
  numberContainer: {
    alignItems: 'center',
    height: NUMBER_HEIGHT,
    justifyContent: 'center',
  },
  numberText: {
    color: '#000000',
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontSize: 90,
    textAlign: 'center',
  },
  topGradient: {
    bottom: 0,
    height: 15,
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 9,
  },
  topPosition: {
    borderCurve: 'continuous',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    top: 0,
  },
});

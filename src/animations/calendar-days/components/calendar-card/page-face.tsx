import { StyleSheet, Text, View } from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  type DerivedValue,
} from 'react-native-reanimated';

import { BODY_COLOR, NUMBER_HEIGHT, PAGE_SIZE, SIZE } from './constants';
import { DepthShadow } from './page-shadows';

import type { PageFaceProps } from './types';

type AnimatedPageFaceProps = PageFaceProps & {
  pageFlipProgress: DerivedValue<number>;
};

const FoldGradient = ({ variant }: { variant: 'front' | 'back' }) => (
  <LinearGradient
    colors={
      variant === 'front'
        ? ['rgba(0,0,0,0.04)', 'transparent']
        : ['transparent', 'rgba(0,0,0,0.04)']
    }
    style={
      variant === 'front' ? styles.foldGradientTop : styles.foldGradientBottom
    }
  />
);

export const PageFace = ({
  pageNumber,
  variant,
  pageFlipProgress,
}: AnimatedPageFaceProps) => {
  const isFront = variant === 'front';

  const rVisibilityStyle = useAnimatedStyle(() => {
    const progress = pageFlipProgress.value;
    return {
      opacity: isFront ? (progress < 0.5 ? 1 : 0) : progress >= 0.5 ? 1 : 0,
    };
  });

  return (
    <Animated.View style={[rVisibilityStyle, styles.faceContainer]}>
      <FoldGradient variant={variant} />
      <View
        style={[
          styles.numberContainer,
          {
            transform: isFront
              ? [
                  { translateY: -PAGE_SIZE / 2 },
                  { rotate: '180deg' },
                  { scaleX: -1 },
                  { scaleY: -1 },
                ]
              : [
                  { translateY: -PAGE_SIZE / 2 },
                  { rotate: '180deg' },
                  { scaleX: -1 },
                ],
          },
        ]}>
        <Text style={styles.numberText}>{pageNumber}</Text>
      </View>
      <DepthShadow pageFlipProgress={pageFlipProgress} variant={variant} />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  faceContainer: {
    alignItems: 'center',
    backgroundColor: BODY_COLOR,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    borderCurve: 'continuous',
    height: PAGE_SIZE,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'absolute',
    width: SIZE,
  },
  foldGradientBottom: {
    bottom: 0,
    height: 10,
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 9,
  },
  foldGradientTop: {
    height: 10,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 9,
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
    includeFontPadding: false,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
});

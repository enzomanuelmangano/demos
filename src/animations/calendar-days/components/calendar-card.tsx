import { StyleSheet, Text, View } from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

type CalendarCardProps = {
  progress: SharedValue<number>;
  totalPages: number;
};

const SIZE = 200;
const HEADER_HEIGHT = 50;
const BODY_HEIGHT = SIZE - HEADER_HEIGHT;
const PAGE_SIZE = BODY_HEIGHT / 2;
const NUMBER_HEIGHT = BODY_HEIGHT;

const HEADER_COLOR = '#F07167';
const BODY_COLOR = '#FFFFFF';

type PageProps = {
  index: number;
  progress: SharedValue<number>;
  frontPageNumber: number;
  backPageNumber: number;
  totalPages: number;
};

type StaticPageProps = {
  pageNumber: number;
  position: 'top' | 'bottom';
};

const StaticPage = ({ pageNumber, position }: StaticPageProps) => {
  const isTop = position === 'top';

  return (
    <View
      style={{
        position: 'absolute',
        width: SIZE,
        height: PAGE_SIZE,
        top: isTop ? 0 : PAGE_SIZE,
        backgroundColor: BODY_COLOR,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderBottomLeftRadius: !isTop ? 20 : 0,
        borderBottomRightRadius: !isTop ? 20 : 0,
        borderTopLeftRadius: !isTop ? 0 : 20,
        borderTopRightRadius: !isTop ? 0 : 20,
        borderCurve: 'continuous',
      }}>
      {/* Divider line and shadow gradient above the fold on top half */}
      {isTop && (
        <>
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.03)']}
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 15,
              zIndex: 9,
            }}
          />
          <View
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 1,
              backgroundColor: 'rgba(0,0,0,0.08)',
              zIndex: 10,
            }}
          />
        </>
      )}
      {/* Shadow gradient below the fold on bottom half */}
      {!isTop && (
        <LinearGradient
          colors={['rgba(0,0,0,0.04)', 'transparent']}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 15,
            zIndex: 9,
          }}
        />
      )}
      <View
        style={{
          height: NUMBER_HEIGHT,
          justifyContent: 'center',
          alignItems: 'center',
          transform: [{ translateY: isTop ? PAGE_SIZE / 2 : -PAGE_SIZE / 2 }],
        }}>
        <Text style={styles.numberText}>{pageNumber}</Text>
      </View>
    </View>
  );
};

const Page = ({
  index,
  progress,
  frontPageNumber,
  backPageNumber,
  totalPages,
}: PageProps) => {
  // Each page has its own spring animation
  // Target is 1 (flipped) if current page > this page's index, 0 (not flipped) otherwise
  const pageFlipProgress = useDerivedValue(() => {
    const currentPage = progress.value * totalPages;
    // This page should be flipped if currentPage > index
    const targetFlip = currentPage > index ? 1 : 0;

    return withSpring(targetFlip, {
      duration: 1000,
      dampingRatio: 1,
    });
  }, [index, totalPages]);

  const rStyle = useAnimatedStyle(() => {
    const pageProgress = pageFlipProgress.value;

    // Before 90deg (0.5): higher index pages should be on top (unflipped stack)
    // After 90deg (0.5): lower index pages should be on top (flipped stack)
    const zIndex =
      pageProgress < 0.5 ? totalPages - index : index + totalPages + 1;

    return {
      zIndex,
      transform: [
        { perspective: 600 },
        { translateY: -PAGE_SIZE / 2 },
        { rotateX: `${pageProgress * 180}deg` },
        { translateY: PAGE_SIZE / 2 },
      ],
    };
  });

  const rFirstHalfStyle = useAnimatedStyle(() => {
    const pageProgress = pageFlipProgress.value;

    return {
      opacity: pageProgress < 0.5 ? 1 : 0,
    };
  });

  // Shadow overlay on front face - gets darker as it rotates away from light
  const rFirstHalfShadowStyle = useAnimatedStyle(() => {
    const pageProgress = pageFlipProgress.value;

    // Darken as page lifts (facing away from light source above)
    const shadowOpacity = interpolate(
      pageProgress,
      [0, 0.5],
      [0, 0.3],
      Extrapolation.CLAMP,
    );

    return {
      opacity: shadowOpacity,
    };
  });

  const rSecondHalfStyle = useAnimatedStyle(() => {
    const pageProgress = pageFlipProgress.value;

    return {
      opacity: pageProgress >= 0.5 ? 1 : 0,
    };
  });

  // Shadow overlay on back face - starts dark, lightens as it faces the light
  const rSecondHalfShadowStyle = useAnimatedStyle(() => {
    const pageProgress = pageFlipProgress.value;

    // Starts in shadow, lightens as it comes down to face the light
    const shadowOpacity = interpolate(
      pageProgress,
      [0.5, 1],
      [0.3, 0],
      Extrapolation.CLAMP,
    );

    return {
      opacity: shadowOpacity,
    };
  });

  // Animated shadow cast onto the bottom half
  const rShadowStyle = useAnimatedStyle(() => {
    const pageProgress = pageFlipProgress.value;

    // Shadow peaks at 90deg when page is perpendicular
    const shadowOpacity = interpolate(
      pageProgress,
      [0, 0.5, 1],
      [0, 0.35, 0],
      Extrapolation.CLAMP,
    );

    return {
      opacity: shadowOpacity,
    };
  });

  return (
    <>
      {/* Animated shadow cast onto the bottom static half - rendered separately so it doesn't rotate */}
      <Animated.View
        pointerEvents="none"
        style={[
          rShadowStyle,
          {
            position: 'absolute',
            width: SIZE,
            height: PAGE_SIZE,
            top: PAGE_SIZE,
            zIndex: 1,
          },
        ]}>
        <LinearGradient
          colors={['rgba(0,0,0,0.6)', 'transparent']}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: PAGE_SIZE,
          }}
        />
      </Animated.View>

      {/* The flipping page */}
      <Animated.View
        style={[
          rStyle,
          {
            position: 'absolute',
            width: SIZE,
            height: PAGE_SIZE,
            top: PAGE_SIZE,
            transformOrigin: ['50%', '50%', 0.005],
          },
        ]}>
        {/* Front face - bottom half of current number */}
        <Animated.View
          style={[
            rFirstHalfStyle,
            {
              position: 'absolute',
              width: SIZE,
              height: PAGE_SIZE,
              overflow: 'hidden',
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: BODY_COLOR,
              borderBottomLeftRadius: 20,
              borderBottomRightRadius: 20,
              borderCurve: 'continuous',
            },
          ]}>
          {/* Shadow gradient at fold line */}
          <LinearGradient
            colors={['rgba(0,0,0,0.04)', 'transparent']}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 10,
              zIndex: 9,
            }}
          />
          <View
            style={{
              height: NUMBER_HEIGHT,
              justifyContent: 'center',
              alignItems: 'center',
              transform: [
                { translateY: -PAGE_SIZE / 2 },
                { rotate: '180deg' },
                { scaleX: -1 },
                { scaleY: -1 },
              ],
            }}>
            <Text style={styles.numberText}>{frontPageNumber}</Text>
          </View>
          {/* Depth shadow overlay - darkens as page rotates away from light */}
          <Animated.View
            pointerEvents="none"
            style={[
              rFirstHalfShadowStyle,
              {
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.3)',
              },
            ]}
          />
        </Animated.View>
        {/* Back face - top half of next number */}
        <Animated.View
          style={[
            rSecondHalfStyle,
            {
              position: 'absolute',
              width: SIZE,
              height: PAGE_SIZE,
              overflow: 'hidden',
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: BODY_COLOR,
              borderBottomLeftRadius: 20,
              borderBottomRightRadius: 20,
              borderCurve: 'continuous',
            },
          ]}>
          {/* Shadow gradient at fold line */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.04)']}
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 10,
              zIndex: 9,
            }}
          />
          <View
            style={{
              height: NUMBER_HEIGHT,
              justifyContent: 'center',
              alignItems: 'center',
              transform: [
                { translateY: -PAGE_SIZE / 2 },
                { rotate: '180deg' },
                { scaleX: -1 },
              ],
            }}>
            <Text style={styles.numberText}>{backPageNumber}</Text>
          </View>
          {/* Depth shadow overlay - starts dark, lightens as page faces the light */}
          <Animated.View
            pointerEvents="none"
            style={[
              rSecondHalfShadowStyle,
              {
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.3)',
              },
            ]}
          />
        </Animated.View>
      </Animated.View>
    </>
  );
};

const CalendarCard = ({ progress, totalPages }: CalendarCardProps) => {
  return (
    <View style={styles.container}>
      <View style={styles.cardShadow}>
        <View>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerText}>ON THE</Text>
          </View>

          {/* Body with flip animation */}
          <View style={styles.body}>
            {/* Static top half - shows upper portion of the first number */}
            <StaticPage pageNumber={1} position="top" />

            {/* Static bottom half - shows lower portion of the last number */}
            <StaticPage pageNumber={totalPages + 1} position="bottom" />

            {/* Flipping pages */}
            {Array.from({ length: totalPages }).map((_, index) => (
              <Page
                key={index}
                index={index}
                progress={progress}
                frontPageNumber={index + 1}
                backPageNumber={index + 2}
                totalPages={totalPages}
              />
            ))}
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  body: {
    backgroundColor: BODY_COLOR,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    borderCurve: 'continuous',
    height: BODY_HEIGHT,
    // overflow: 'hidden',
    position: 'relative',
    width: SIZE,
  },
  cardShadow: {
    borderCurve: 'continuous',
    borderRadius: 24,
    boxShadow: '0px 0px 20px rgba(0, 0, 0, 0.1)',
  },
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    backgroundColor: HEADER_COLOR,
    borderCurve: 'continuous',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: HEADER_HEIGHT,
    justifyContent: 'center',
    width: SIZE,
  },
  headerText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: 3,
  },
  numberText: {
    color: '#000000',
    fontSize: 90,
    fontWeight: '700',
    textAlign: 'center',
  },
});

export { CalendarCard, SIZE as CARD_WIDTH };

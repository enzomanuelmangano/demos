import { StyleSheet, Text, View } from 'react-native';

import { interpolate } from '@shopify/react-native-skia';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Extrapolation,
  interpolateColor,
  useAnimatedStyle,
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
  const minPageProgress = index * (1 / totalPages);
  const maxPageProgress = (index + 1) * (1 / totalPages);

  const pageBuffer = 1 / totalPages;
  const maxPageBuffer = 5 * pageBuffer;

  const rStyle = useAnimatedStyle(() => {
    const pageProgress = interpolate(
      progress.value,
      [minPageProgress, maxPageProgress],
      [0, 1],
      Extrapolation.CLAMP,
    );

    const isPageVisible =
      progress.value >= minPageProgress - maxPageBuffer &&
      progress.value <= maxPageProgress + maxPageBuffer;

    const isActivePage = index === Math.round(progress.value * totalPages);

    return {
      opacity: isPageVisible ? 1 : 0,
      zIndex: isActivePage ? 100 : index,
      transform: [
        { perspective: 1000 },
        { translateY: -PAGE_SIZE / 2 },
        { rotateX: `${pageProgress * 180}deg` },
        { translateY: PAGE_SIZE / 2 },
      ],
    };
  });

  const rFirstHalfStyle = useAnimatedStyle(() => {
    const pageProgress = interpolate(
      progress.value,
      [minPageProgress, maxPageProgress],
      [0, 1],
      Extrapolation.CLAMP,
    );

    // Darken as page lifts (0 to 0.5)
    const backgroundColor = interpolateColor(
      pageProgress,
      [0, 0.5],
      [BODY_COLOR, '#E8E8E8'],
    );

    return {
      opacity: pageProgress < 0.5 ? 1 : 0,
      backgroundColor,
    };
  });

  const rSecondHalfStyle = useAnimatedStyle(() => {
    const pageProgress = interpolate(
      progress.value,
      [minPageProgress, maxPageProgress],
      [0, 1],
      Extrapolation.CLAMP,
    );

    // Start dark and lighten as page comes down (0.5 to 1)
    const backgroundColor = interpolateColor(
      pageProgress,
      [0.5, 1],
      ['#E8E8E8', BODY_COLOR],
    );

    return {
      opacity: pageProgress >= 0.5 ? 1 : 0,
      backgroundColor,
    };
  });

  // Animated shadow cast onto the bottom half
  const rShadowStyle = useAnimatedStyle(() => {
    const pageProgress = interpolate(
      progress.value,
      [minPageProgress, maxPageProgress],
      [0, 1],
      Extrapolation.CLAMP,
    );

    // Shadow peaks at mid-flip (90 degrees) when page is perpendicular
    const shadowOpacity = interpolate(
      pageProgress,
      [0, 0.5, 1],
      [0, 0.5, 0],
      Extrapolation.CLAMP,
    );

    return {
      opacity: shadowOpacity,
    };
  });

  return (
    <Animated.View
      style={[
        rStyle,
        {
          position: 'absolute',
          width: SIZE,
          height: PAGE_SIZE,
          top: PAGE_SIZE,
          transformOrigin: ['50%', '50%', 0.005],
          // zIndex: index === 0 || index === totalPages - 1 ? 100 : -index,
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
            borderBottomLeftRadius: 20,
            borderBottomRightRadius: 20,
            borderCurve: 'continuous',
          },
        ]}>
        {/* Static shadow gradient on front face */}
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
            borderBottomLeftRadius: 20,
            borderBottomRightRadius: 20,
            borderCurve: 'continuous',
          },
        ]}>
        {/* Static shadow gradient on back face */}
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
      </Animated.View>
      {/* Animated shadow overlay that casts onto the bottom static page */}
      <Animated.View
        pointerEvents="none"
        style={[
          rShadowStyle,
          {
            position: 'absolute',
            width: SIZE,
            height: PAGE_SIZE,
            top: 0,
            zIndex: -1,
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
    </Animated.View>
  );
};

const CalendarCard = ({ progress, totalPages }: CalendarCardProps) => {
  return (
    <View style={styles.container}>
      <View style={styles.cardShadow}>
        <View style={styles.card}>
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
    overflow: 'hidden',
    position: 'relative',
    width: SIZE,
  },
  card: {
    borderCurve: 'continuous',
    borderRadius: 24,
    overflow: 'hidden',
  },
  cardShadow: {
    borderCurve: 'continuous',
    borderRadius: 24,
    boxShadow: '0px 10px 20px rgba(0, 0, 0, 0.25)',
  },
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    backgroundColor: HEADER_COLOR,
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

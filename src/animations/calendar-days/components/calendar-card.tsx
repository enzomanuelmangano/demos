import { StyleSheet, Text, View } from 'react-native';

import { interpolate } from '@shopify/react-native-skia';
import Animated, {
  Extrapolation,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

type CalendarCardProps = {
  progress: SharedValue<number>;
  totalPages: number;
};

const SIZE = 200;
const PAGE_SIZE = SIZE / 2;

const TOP_COLOR = '#c9312c';
const BOTTOM_COLOR = '#c9632c';

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
        backgroundColor: isTop ? TOP_COLOR : BOTTOM_COLOR,
        alignItems: 'center',
        borderTopLeftRadius: isTop ? 20 : 0,
        borderTopRightRadius: isTop ? 20 : 0,
        borderBottomLeftRadius: isTop ? 0 : 20,
        borderBottomRightRadius: isTop ? 0 : 20,
        borderCurve: 'continuous',
        overflow: 'hidden',
      }}>
      <View
        style={{
          transform: [{ translateY: isTop ? PAGE_SIZE / 2 : -PAGE_SIZE / 2 }],
        }}>
        <Text style={styles.text}>{pageNumber}</Text>
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

  const rStyle = useAnimatedStyle(() => {
    const pageProgress = interpolate(
      progress.value,
      [minPageProgress, maxPageProgress],
      [0, 1],
      Extrapolation.CLAMP,
    );

    const isPageVisible =
      progress.value >= minPageProgress - 1 / totalPages &&
      progress.value <= maxPageProgress + 1 / totalPages;

    return {
      opacity: isPageVisible ? 1 : 0,
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

    return {
      opacity: pageProgress < 0.5 ? 1 : 0,
    };
  });

  const rSecondHalfStyle = useAnimatedStyle(() => {
    const pageProgress = interpolate(
      progress.value,
      [minPageProgress, maxPageProgress],
      [0, 1],
      Extrapolation.CLAMP,
    );

    return {
      opacity: pageProgress >= 0.5 ? 1 : 0,
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
          zIndex: index === 0 || index === totalPages - 1 ? 100 : index,
        },
      ]}>
      {/* Front face - visible before flip (0-90deg) */}
      <Animated.View
        style={[
          rFirstHalfStyle,
          {
            position: 'absolute',
            width: SIZE,
            height: PAGE_SIZE,
            backgroundColor: BOTTOM_COLOR,
            overflow: 'hidden',
            justifyContent: 'flex-start',
            alignItems: 'center',
            borderBottomLeftRadius: 20,
            borderBottomRightRadius: 20,
            borderCurve: 'continuous',
          },
        ]}>
        <View
          style={{
            transform: [
              { translateY: -PAGE_SIZE / 2 },
              { rotate: '180deg' },
              { scaleX: -1 },
              { scaleY: -1 },
            ],
          }}>
          <Text style={styles.text}>{frontPageNumber}</Text>
        </View>
      </Animated.View>
      {/* Back face - visible after flip (90-180deg) */}
      <Animated.View
        style={[
          rSecondHalfStyle,
          {
            position: 'absolute',
            width: SIZE,
            height: PAGE_SIZE,
            backgroundColor: TOP_COLOR,
            overflow: 'hidden',
            justifyContent: 'flex-start',
            alignItems: 'center',
            borderBottomLeftRadius: 20,
            borderBottomRightRadius: 20,
            borderCurve: 'continuous',
          },
        ]}>
        <View
          style={{
            transform: [
              { translateY: -PAGE_SIZE / 2 },
              { rotate: '180deg' },
              { scaleX: -1 },
            ],
          }}>
          <Text style={styles.text}>{backPageNumber}</Text>
        </View>
      </Animated.View>
    </Animated.View>
  );
};

const CalendarCard = ({ progress, totalPages }: CalendarCardProps) => {
  return (
    <View style={styles.container}>
      <View style={{ width: SIZE, height: SIZE }}>
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
            totalPages={totalPages - 1}
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 80,
    lineHeight: 100,
    textAlign: 'center',
  },
});

export { CalendarCard, SIZE as CARD_WIDTH };

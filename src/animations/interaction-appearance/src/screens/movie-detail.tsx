import { ScrollView, StyleSheet, Text as RNText } from 'react-native';

import { type FC, useEffect, useRef, useState } from 'react';

import { useImage } from '@shopify/react-native-skia';

import { BottomLinearGradient } from '../components/bottom-linear-gradient';
import { MovieImage } from '../components/movie-image';
import {
  FloatingButtonTheme,
  ThemeBlurView,
  ThemeRescaler,
} from '../components/theme-switch';
import { Text, View, useTheme } from '../theme';

type MovieDetailProps = {
  title: string;
  description: string;
  image: string;
};

export const MovieDetail: FC<MovieDetailProps> = ({
  title,
  description,
  image,
}) => {
  const { colors, theme } = useTheme();
  const skImage = useImage(image);

  const imageHeight = 250;

  // e2e outcome probe: exposes the current appearance plus how many times it
  // has toggled, so a test can assert the transition actually ran (the visible
  // change is a Skia rescaler/blur). Near-invisible (alpha ~0.012).
  const [toggleCount, setToggleCount] = useState(0);
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setToggleCount(count => count + 1);
  }, [theme]);

  return (
    <>
      <RNText testID="interaction-appearance-status" style={styles.statusProbe}>
        {`${theme}#${toggleCount}`}
      </RNText>
      <FloatingButtonTheme />
      <ThemeBlurView />

      <View style={{ backgroundColor: colors.background, flex: 1 }}>
        <ThemeRescaler>
          <MovieImage skImage={skImage} imageHeight={imageHeight} blur={500} />
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.contentList}>
            <MovieImage skImage={skImage} imageHeight={imageHeight} />
            <View style={styles.textContainer}>
              <Text style={[styles.title, { color: colors.primary }]}>
                {title}
              </Text>
              <Text style={[styles.description, { color: colors.text }]}>
                {description}
              </Text>
            </View>
          </ScrollView>
          <BottomLinearGradient />
        </ThemeRescaler>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  contentList: {
    paddingBottom: 200,
  },
  description: {
    fontSize: 16,
    lineHeight: 22,
    marginRight: 32,
    marginTop: 16,
  },
  textContainer: {
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 32,
  },
  // Near-invisible to the eye, but on-screen for the e2e accessibility tree.
  statusProbe: {
    position: 'absolute',
    top: 0,
    left: 0,
    fontSize: 1,
    color: '#808080',
    opacity: 0.012,
    zIndex: 1000,
  },
});

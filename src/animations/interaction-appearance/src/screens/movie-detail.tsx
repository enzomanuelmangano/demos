import { ScrollView, StyleSheet } from 'react-native';

import { type FC } from 'react';

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
  const { colors } = useTheme();
  const skImage = useImage(image);

  const imageHeight = 250;

  return (
    <>
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
});

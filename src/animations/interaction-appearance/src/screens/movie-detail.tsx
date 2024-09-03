import { ScrollView, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useImage } from '@shopify/react-native-skia';
import React from 'react';

import { Text, View, useTheme } from '../theme';
import {
  FloatingButtonTheme,
  ThemeBlurView,
  ThemeRescaler,
} from '../components/theme-switch';
import { BottomLinearGradient } from '../components/bottom-linear-gradient';
import { MovieImage } from '../components/movie-image';

type MovieDetailProps = {
  title: string;
  description: string;
  image: string;
};

export const MovieDetail: React.FC<MovieDetailProps> = ({
  title,
  description,
  image,
}) => {
  const { theme } = useTheme();
  const skImage = useImage(image);

  const imageHeight = 250;

  return (
    <>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} animated />
      <FloatingButtonTheme />
      <ThemeBlurView />

      <View backgroundColor="background">
        <ThemeRescaler>
          <MovieImage skImage={skImage} imageHeight={imageHeight} blur={500} />
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.contentList}>
            <MovieImage skImage={skImage} imageHeight={imageHeight} />
            <View style={styles.textContainer}>
              <Text color="primary" style={styles.title}>
                {title}
              </Text>
              <Text color="text" style={styles.description}>
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
  title: {
    fontSize: 32,
  },
  description: {
    marginTop: 16,
    lineHeight: 22,
    marginRight: 32,
    fontSize: 16,
  },
  contentList: {
    paddingBottom: 200,
  },
  textContainer: {
    paddingHorizontal: 32,
  },
});

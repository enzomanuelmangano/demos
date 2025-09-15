import React from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { AnimatedImage } from '../../components/animated-image';
import type { DetailsRouteProp } from '../../typings';

const DetailsScreen: React.FC<{ route: DetailsRouteProp }> = React.memo(
  ({
    route: {
      params: { source, heroTag },
    },
  }) => {
    return (
      <>
        <View style={styles.container}>
          <AnimatedImage
            cachePolicy="memory-disk"
            // @@TODO: maybe back in 4.2.0
            // sharedTransitionTag={heroTag}
            source={source}
            style={styles.imageContainer}
          />
          <View style={styles.textContainer}>
            <Animated.Text
              entering={FadeIn.delay(400)}
              exiting={FadeOut}
              style={styles.title}>
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. Donec
            </Animated.Text>
            <Animated.Text
              entering={FadeIn.delay(600)}
              exiting={FadeOut}
              style={styles.paragraph}>
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. Donec
              Lorem ipsum dolor sit amet consectetur adipisicing elit. Id
              tenetur deserunt vel, harum at cupiditate eveniet pariatur
              perferendis maiores possimus omnis accusantium itaque sapiente
              blanditiis asperiores! Pariatur alias autem non?
            </Animated.Text>
          </View>
        </View>
      </>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  imageContainer: {
    width: Dimensions.get('window').width,
    height: 300,
  },
  textContainer: {
    paddingHorizontal: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 15,
  },
  paragraph: {
    fontSize: 16,
    marginTop: 20,
  },
});

export { DetailsScreen };

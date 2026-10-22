import { Dimensions, StyleSheet, Text, View } from 'react-native';

import { type FC, memo } from 'react';

import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { PressableOpacity } from 'pressto';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DEMO_BUTTON_ROW_HEIGHT } from '../../../../navigation/home/demo-close-button';
import { AnimatedImage } from '../../components/animated-image';

import type { DetailsRouteProp } from '../../typings';

const DetailsScreen: FC<{ route: DetailsRouteProp }> = memo(
  ({
    route: {
      params: { source },
    },
  }) => {
    const { goBack } = useNavigation();
    const { top: safeTop } = useSafeAreaInsets();

    return (
      <>
        <View
          style={[
            styles.container,
            { paddingTop: safeTop + DEMO_BUTTON_ROW_HEIGHT },
          ]}>
          <PressableOpacity onPress={goBack} style={styles.back}>
            <Ionicons name="chevron-back" size={24} color={BACK_COLOR} />
            <Text style={styles.backText}>Home</Text>
          </PressableOpacity>
          <AnimatedImage
            cachePolicy="memory-disk"
            // The image is at most ~1.1x the header: Core Animation scales
            // it instead of a main-thread redraw.
            allowDownscaling={false}
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

const BACK_COLOR = '#007AFF';

const styles = StyleSheet.create({
  back: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    height: 44,
    paddingHorizontal: 8,
  },
  backText: {
    color: BACK_COLOR,
    fontSize: 17,
  },
  container: {
    flex: 1,
  },
  imageContainer: {
    height: 300,
    width: Dimensions.get('window').width,
  },
  paragraph: {
    fontSize: 16,
    marginTop: 20,
  },
  textContainer: {
    paddingHorizontal: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 15,
  },
});

export { DetailsScreen };

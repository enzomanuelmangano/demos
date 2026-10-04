import { View, StyleSheet } from 'react-native';

import { Image } from 'expo-image';
import Animated, {
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';

import { MiniPlayerHeight } from './constants';
import { Palette } from '../../../../constants/palette';

import type { SharedValue } from 'react-native-reanimated';

type SheetContentProps = {
  progress: SharedValue<number>;
  title: string;
  subtitle: string;
  imageUrl: string;
};

const ImageHeight = 44;
const ExpandedImageHeight = ImageHeight * 3;

const BaseOffset = (MiniPlayerHeight - ImageHeight) / 2;

export const SheetContent = ({
  progress,
  title,
  subtitle,
  imageUrl,
}: SheetContentProps) => {
  const rImageStyle = useAnimatedStyle(() => {
    const imageSize = interpolate(
      progress.get(),
      [0, 1],
      [ImageHeight, ExpandedImageHeight],
    );
    return {
      height: imageSize,
      width: imageSize,
      borderRadius: interpolate(progress.get(), [0, 1], [8, 24]),
      borderCurve: 'continuous',
      overflow: 'hidden',
    };
  }, []);

  // The vertical offsets are transforms (static marginTop + translateY):
  // nothing is laid out below these views, so the result is the same
  // without a layout pass for them. marginLeft stays a layout prop because
  // it also sets the width available to the labels.
  const rContentStyle = useAnimatedStyle(() => {
    return {
      marginLeft: interpolate(progress.get(), [0, 1], [BaseOffset, 24]),
      transform: [
        { translateY: interpolate(progress.get(), [0, 1], [0, 120]) },
      ],
    };
  });

  const rTitleStyle = useAnimatedStyle(() => {
    return {
      fontSize: interpolate(progress.get(), [0, 1], [14, 28]),
    };
  });

  const rSubtitleStyle = useAnimatedStyle(() => {
    return {
      fontSize: interpolate(progress.get(), [0, 1], [12, 24]),
    };
  });

  const rLabelsContainerStyle = useAnimatedStyle(() => {
    return {
      position: 'absolute',
      top: 0,
      left: interpolate(progress.get(), [0, 1], [ImageHeight + 10, 0]),
      marginTop: 5,
      transform: [
        {
          translateY: interpolate(
            progress.get(),
            [0, 1],
            [0, ExpandedImageHeight + 24 - 5],
          ),
        },
      ],
    };
  });

  return (
    <View style={styles.fill}>
      <Animated.View style={[styles.content, rContentStyle]}>
        <Animated.View style={rImageStyle}>
          {/* expo-image: RN's Image re-requests the bitmap as its view grows */}
          <Image
            source={{
              uri: imageUrl,
            }}
            style={styles.fill}
          />
        </Animated.View>
        <Animated.View style={rLabelsContainerStyle}>
          <Animated.Text style={[rTitleStyle, styles.title]}>
            {title}
          </Animated.Text>
          <Animated.Text style={[rSubtitleStyle, styles.subtitle]}>
            {subtitle}
          </Animated.Text>
        </Animated.View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  content: {
    marginTop: BaseOffset,
  },
  fill: {
    flex: 1,
  },
  subtitle: {
    color: Palette.text,
    marginTop: 2,
    opacity: 0.5,
  },
  title: {
    color: Palette.text,
  },
});

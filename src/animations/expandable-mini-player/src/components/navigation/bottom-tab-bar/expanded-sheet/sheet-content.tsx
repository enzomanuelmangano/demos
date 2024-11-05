import { View, Image, StyleSheet } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import Animated, {
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';

import { Palette } from '../../../../constants/palette';

import { MiniPlayerHeight } from './constants';

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
      progress.value,
      [0, 1],
      [ImageHeight, ExpandedImageHeight],
    );
    return {
      height: imageSize,
      width: imageSize,
      borderRadius: interpolate(progress.value, [0, 1], [8, 24]),
      borderCurve: 'continuous',
      overflow: 'hidden',
    };
  }, []);

  const rContentStyle = useAnimatedStyle(() => {
    return {
      marginTop: interpolate(
        progress.value,
        [0, 1],
        [BaseOffset, BaseOffset + 120],
      ),
      marginLeft: interpolate(progress.value, [0, 1], [BaseOffset, 24]),
    };
  });

  const rTitleStyle = useAnimatedStyle(() => {
    return {
      fontSize: interpolate(progress.value, [0, 1], [14, 28]),
    };
  });

  const rSubtitleStyle = useAnimatedStyle(() => {
    return {
      fontSize: interpolate(progress.value, [0, 1], [12, 24]),
    };
  });

  const rLabelsContainerStyle = useAnimatedStyle(() => {
    return {
      position: 'absolute',
      top: 0,
      left: interpolate(progress.value, [0, 1], [ImageHeight + 10, 0]),
      marginTop: interpolate(
        progress.value,
        [0, 1],
        [5, ExpandedImageHeight + 24],
      ),
    };
  });

  return (
    <View style={styles.fill}>
      <Animated.View style={rContentStyle}>
        <Animated.View style={rImageStyle}>
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
  fill: {
    flex: 1,
  },
  title: {
    color: Palette.text,
  },
  subtitle: {
    color: Palette.text,
    opacity: 0.5,
    marginTop: 2,
  },
});
